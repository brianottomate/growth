import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import {
  brandTable,
  campaignTable,
  adTable,
  audienceTable,
  platformCampaignTable,
  mediaAssetTable,
  mediaFolderTable,
} from "@/server/db/schema";
import {
  getZernioAdsTree,
  getZernioMetaCreative,
  getZernioMetaAdSet,
  listZernioMetaImages,
} from "@/server/clients/zernio.client";
import { listAdsWriteDestinations } from "./ads-write.service";
import { createDraftCampaign } from "./ads-draft.service";
import { importRemoteImage } from "./media.service";
import {
  inspectMetaCreative,
  importedIdea,
  object,
  objects,
  string,
} from "@/lib/meta-import";
import { projectIdea } from "@/lib/ad-idea-studio";
import { createId } from "@/server/db/utils";

export const importMetaCampaignSchema = z.object({
  brandSlug: z.string().min(1),
  externalCampaignId: z.string().min(1),
  name: z.string().trim().min(1).max(300),
});
/** Copies into a separate local draft. No provider mutation; source IDs are provenance, never delivery IDs. */
export async function importMetaCampaign(
  input: z.infer<typeof importMetaCampaignSchema>,
  ctx: { orgId: string; userId: string },
) {
  const args = importMetaCampaignSchema.parse(input);
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.slug, args.brandSlug),
      eq(brandTable.organizationId, ctx.orgId),
      isNull(brandTable.deletedAt),
    ),
  });
  if (!brand) throw new Error("Brand not found");
  const existing = await db.query.campaignTable.findFirst({
    where: and(
      eq(campaignTable.brandId, brand.id),
      eq(campaignTable.slug, `meta-import-${args.externalCampaignId}`),
    ),
  });
  if (existing)
    return {
      campaignId: existing.id,
      path: `/app/brands/${brand.slug}/ads/${existing.id}`,
      reused: true,
    };
  const [tree, scope] = await Promise.all([
    getZernioAdsTree({ pageId: brand.metaPageId ?? undefined }),
    listAdsWriteDestinations({
      organizationId: ctx.orgId,
      brandSlug: args.brandSlug,
      platform: "meta",
    }),
  ]);
  const source = tree.find(
    (c) => c.platformCampaignId === args.externalCampaignId,
  );
  const destination = scope.destinations.find(
    (d) =>
      d.adAccountId === source?.platformAdAccountId &&
      d.connectionAccountId === source?.accountId &&
      d.runsAsBrandPage,
  );
  if (!source || !destination)
    throw new Error(
      "Campaign is outside this brand’s allowlisted Meta destination",
    );
  const sourceAds = (source.adSets ?? []).flatMap((s) => s.ads ?? []);
  if (!sourceAds.length) throw new Error("No ads returned for this campaign");
  const sets = [];
  for (const s of source.adSets ?? [])
    sets.push(
      (
        await getZernioMetaAdSet(
          string(s.platformAdSetId),
          destination.connectionAccountId,
        )
      ).adSet,
    );
  const creatives = [];
  for (const ad of sourceAds) {
    const creativeId =
      string(ad.creative?.id) || string(ad.creative?.creativeId);
    if (!creativeId) throw new Error("Creative identifier missing");
    const raw = (
      await getZernioMetaCreative(creativeId, destination.connectionAccountId)
    ).creative;
    if (string(object(raw.object_story_spec).page_id) !== brand.metaPageId)
      throw new Error("A creative belongs to a different Facebook Page");
    creatives.push({ ad, creativeId, raw, parsed: inspectMetaCreative(raw) });
  }
  const wanted = new Set(creatives.flatMap((c) => c.parsed.hashes));
  const images = new Map<
    string,
    { hash: string; url: string; width?: number; height?: number }
  >();
  let after: string | undefined;
  for (let page = 0; page < 100 && wanted.size; page++) {
    const result = await listZernioMetaImages(
      destination.connectionAccountId,
      destination.adAccountId,
      after,
    );
    for (const image of result.data)
      if (wanted.delete(image.hash)) images.set(image.hash, image);
    if (!result.paging?.after || result.paging.after === after) break;
    after = result.paging.after;
  }
  const imported = new Map<
    string,
    {
      hash: string;
      url: string;
      assetId: string;
      width?: number;
      height?: number;
    }
  >();
  await db
    .insert(mediaFolderTable)
    .values({
      brandId: brand.id,
      name: args.name,
      description: `Original assets imported from Meta ${args.externalCampaignId}`,
    })
    .onConflictDoNothing();
  const folder = await db.query.mediaFolderTable.findFirst({
    where: and(
      eq(mediaFolderTable.brandId, brand.id),
      eq(mediaFolderTable.name, args.name),
    ),
  });
  for (const [hash, image] of images) {
    const asset = await importRemoteImage({
      brandId: brand.id,
      uploadedBy: ctx.userId,
      url: image.url,
      title: `${args.name} · ${hash.slice(0, 8)}`,
    });
    if (!asset.url) throw new Error("Imported image has no stored URL");
    await db
      .update(mediaAssetTable)
      .set({
        folderId: folder?.id,
        width: image.width,
        height: image.height,
        metadata: {
          metaImageHash: hash,
          metaCampaignId: args.externalCampaignId,
        },
      })
      .where(eq(mediaAssetTable.id, asset.id));
    imported.set(hash, {
      hash,
      url: asset.url,
      assetId: asset.id,
      width: image.width,
      height: image.height,
    });
  }
  const importedAt = new Date().toISOString();
  const issues = [
    sets.some((set) => !object(set.targeting).publisher_platforms)
      ? "Source uses automatic placements; choose supported placements for this working copy."
      : "Source placement restrictions are retained in source settings; choose supported placements for this working copy.",
    "Source targeting, attribution, optimization and creative enhancements are retained as reference; this copy is not an exact live-campaign replica.",
  ];
  const created = await createDraftCampaign({
    organizationId: ctx.orgId,
    brandId: brand.id,
    name: args.name,
    platforms: ["meta_ads"],
    goal: "conversions",
    description: `Imported from Meta campaign ${args.externalCampaignId} on ${importedAt}. Local working copy; source is unchanged.`,
  });
  try {
    const pc = await db.query.platformCampaignTable.findFirst({
      where: eq(platformCampaignTable.campaignId, created.campaign.id),
    });
    await db
      .update(platformCampaignTable)
      .set({
        budget:
          typeof object(source.budget).amount === "number"
            ? (object(source.budget).amount as number)
            : null,
        budgetType: string(object(source.budget).type),
        settings: {
          meta: {
            budgetMode: source.budgetLevel === "adset" ? "abo" : "cbo",
            pixelId: string(object(sets[0]?.promoted_object).pixel_id),
            customEventType: string(
              object(sets[0]?.promoted_object).custom_event_type,
            ),
            importSource: {
              campaignId: args.externalCampaignId,
              importedAt,
              issues,
              adSets: sets,
            },
          },
        },
      })
      .where(eq(platformCampaignTable.id, pc!.id));
    for (const set of sets) {
      const targeting = object(set.targeting),
        geo = object(targeting.geo_locations);
      await db.insert(audienceTable).values({
        brandId: brand.id,
        campaignId: created.campaign.id,
        name: string(set.name),
        ageMin:
          typeof targeting.age_min === "number" ? targeting.age_min : null,
        ageMax:
          typeof targeting.age_max === "number" ? targeting.age_max : null,
        geography: {
          regions: objects(geo.regions).map((r) => string(r.name)),
          countries: Array.isArray(geo.countries)
            ? (geo.countries as string[])
            : undefined,
        },
        optimizationGoal: string(set.optimization_goal),
        description: `Imported Meta ad set ${string(set.id)}; full source settings retained on the platform draft.`,
      });
    }
    for (const c of creatives) {
      const sources = c.parsed.hashes.flatMap((h) =>
        imported.has(h) ? [imported.get(h)!] : [],
      );
      const adIssues = [...c.parsed.issues];
      if (sources.length !== c.parsed.hashes.length)
        adIssues.push("Some original images could not be recovered.");
      const document = importedIdea(c.parsed.copy, sources, c.parsed);
      const content = {
        ...c.parsed.copy,
        media: [],
        metaImport: {
          campaignId: args.externalCampaignId,
          adId: string(c.ad.platformAdId),
          creativeId: c.creativeId,
          importedAt,
          issues: adIssues,
          rawCreative: c.raw,
        },
      };
      const projected = projectIdea(brand.id, content, { document }, null);
      await db.insert(adTable).values({
        id: createId("ad"),
        brandId: brand.id,
        campaignId: created.campaign.id,
        name: c.ad.name ?? "Imported Meta ad",
        type: "creative",
        status: "drawn",
        businessKey: `${created.campaign.id}:${string(c.ad.platformAdId)}`,
        ...projected,
      });
    }
    await db
      .update(campaignTable)
      .set({ slug: `meta-import-${args.externalCampaignId}` })
      .where(eq(campaignTable.id, created.campaign.id));
  } catch (error) {
    await db
      .delete(campaignTable)
      .where(eq(campaignTable.id, created.campaign.id));
    throw error;
  }
  return {
    campaignId: created.campaign.id,
    path: created.path,
    ads: creatives.length,
    assets: imported.size,
    issues,
  };
}
