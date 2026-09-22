import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  brandTable,
  memberTable,
  creativeRunTable,
  mediaFolderTable,
  mediaAssetTable,
} from "@/server/db/schema";
import {
  catalogDraft,
  catalogDraftSchema,
  catalogExportRows,
  type CatalogDraft,
  type CatalogExport,
} from "@/lib/catalog-studio";
import { brandListings } from "./wanderos-listings.service";
import { freezeComposition } from "./composition.service";
import { importRemoteImage } from "./media.service";

const PROVIDER = "catalog-export";
export async function catalogBrand(userId: string, brandId: string) {
  const [brand] = await db
    .select({
      id: brandTable.id,
      name: brandTable.name,
      website: brandTable.website,
      organizationId: memberTable.organizationId,
      settings: brandTable.performanceSettings,
    })
    .from(brandTable)
    .innerJoin(
      memberTable,
      and(
        eq(memberTable.organizationId, brandTable.organizationId),
        eq(memberTable.userId, userId),
      ),
    )
    .where(and(eq(brandTable.id, brandId), isNull(brandTable.deletedAt)))
    .limit(1);
  if (!brand) throw new Error("Brand not found");
  return brand;
}
export async function catalogState(userId: string, brandId: string) {
  const brand = await catalogBrand(userId, brandId);
  const homes = await brandListings(brand);
  const saved = catalogDraftSchema.safeParse(brand.settings?.catalogStudio);
  const runs = await db.query.creativeRunTable.findMany({
    where: and(
      eq(creativeRunTable.brandId, brandId),
      eq(creativeRunTable.provider, PROVIDER),
    ),
    orderBy: [desc(creativeRunTable.createdAt)],
  });
  return {
    homes,
    draft: catalogDraft(homes, saved.success ? saved.data : null),
    exports: runs.map((run): CatalogExport => ({
      ...run.providerOutput,
      id: run.id,
      status: run.status,
      error: run.error,
      createdAt: run.createdAt.toISOString(),
    })),
  };
}
export async function saveCatalog(
  userId: string,
  brandId: string,
  draft: CatalogDraft,
) {
  await catalogBrand(userId, brandId);
  await db
    .update(brandTable)
    .set({
      performanceSettings: sql`jsonb_set(coalesce(${brandTable.performanceSettings}, '{}'::jsonb), '{catalogStudio}', ${JSON.stringify(draft)}::jsonb)`,
    })
    .where(eq(brandTable.id, brandId));
}
export async function startCatalogExport(
  userId: string,
  brandId: string,
  draft: CatalogDraft,
) {
  const brand = await catalogBrand(userId, brandId);
  const homes = await brandListings(brand);
  const included = draft.cards.filter((c) => c.included);
  if (!included.length) throw new Error("Include at least one home");
  if (
    new Set(included.map((c) => c.homeId)).size !== included.length ||
    included.some((c) => !homes.some((h) => h.id === c.homeId))
  )
    throw new Error("Choose homes from this brand");
  await saveCatalog(userId, brandId, draft);
  const [run] = await db
    .insert(creativeRunTable)
    .values({
      brandId,
      organizationId: brand.organizationId,
      createdBy: userId,
      provider: PROVIDER,
      kind: "image",
      model: "composition-renderer",
      prompt: "Freeze catalog compositions and snapshot the matching feed",
      input: { draft, homes },
      providerOutput: {
        completed: 0,
        total: included.length * draft.formats.length,
      },
    })
    .returning();
  return { run: run!, brand, homes };
}
export async function renderCatalogExport(
  input: Awaited<ReturnType<typeof startCatalogExport>>,
  userId: string,
  draft: CatalogDraft,
) {
  const { run, brand, homes } = input;
  const assets: NonNullable<CatalogExport["assets"]> = [];
  let folderId: string | undefined;
  const total =
    draft.cards.filter((c) => c.included).length * draft.formats.length;
  try {
    const [folder] = await db
      .insert(mediaFolderTable)
      .values({
        brandId: brand.id,
        name: `Catalog · ${new Date().toISOString().replaceAll(":", "-")} · ${run.id}`,
        description: "Frozen catalog export",
      })
      .returning();
    folderId = folder!.id;
    await db
      .update(creativeRunTable)
      .set({
        status: "processing",
        providerOutput: { folderId, total, completed: 0 },
      })
      .where(eq(creativeRunTable.id, run.id));
    for (const card of draft.cards.filter((c) => c.included)) {
      const home = homes.find((h) => h.id === card.homeId)!;
      const sourceId =
        card.assetId ??
        (
          await importRemoteImage({
            brandId: brand.id,
            uploadedBy: userId,
            url: card.imageUrl,
            title: `${home.name} · Catalog source`,
          })
        ).id;
      for (const format of draft.formats) {
        const asset = await freezeComposition({
          userId,
          spec: {
            brandId: brand.id,
            sourceMediaAssetId: sourceId,
            templateId: card.templateId,
            formatId: format,
            title: card.title,
            subtitle: card.subtitle,
            imagePosition: card.imagePosition,
            mark: card.showLogo ? "auto" : "none",
            assetTitle: `${home.name} · ${format}`,
          },
        });
        if (!asset.url) throw new Error(`No image URL for ${home.name}`);
        await db
          .update(mediaAssetTable)
          .set({ folderId })
          .where(eq(mediaAssetTable.id, asset.id));
        assets.push({
          homeId: home.id,
          name: home.name,
          assetId: asset.id,
          url: asset.url,
          format,
        });
        await db
          .update(creativeRunTable)
          .set({
            providerOutput: {
              folderId,
              total,
              completed: assets.length,
              assets,
            },
          })
          .where(eq(creativeRunTable.id, run.id));
      }
    }
    const rows = catalogExportRows(homes, draft, assets, brand.name);
    await db
      .update(creativeRunTable)
      .set({
        status: "ready",
        completedAt: new Date(),
        providerOutput: {
          folderId,
          total,
          completed: assets.length,
          assets,
          rows,
          primaryFormat: draft.primaryFormat,
        },
      })
      .where(eq(creativeRunTable.id, run.id));
  } catch (error) {
    await db
      .update(creativeRunTable)
      .set({
        status: "error",
        error: error instanceof Error ? error.message : "Export failed",
        providerOutput: { folderId, total, completed: assets.length, assets },
      })
      .where(eq(creativeRunTable.id, run.id));
  }
}
export async function catalogExport(
  userId: string,
  brandId: string,
  runId: string,
) {
  await catalogBrand(userId, brandId);
  const run = await db.query.creativeRunTable.findFirst({
    where: and(
      eq(creativeRunTable.id, runId),
      eq(creativeRunTable.brandId, brandId),
      eq(creativeRunTable.provider, PROVIDER),
      eq(creativeRunTable.status, "ready"),
    ),
  });
  if (!run) throw new Error("Completed export not found");
  return run.providerOutput as unknown as Required<
    Pick<CatalogExport, "rows" | "assets" | "folderId">
  >;
}
