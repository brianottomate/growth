import "server-only";

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  brandTable,
  memberTable,
  creativeRunTable,
  mediaFolderTable,
  mediaAssetTable,
  homeTable,
} from "@/server/db/schema";
import { fetchWanderOsListingDetail } from "@/server/clients/wanderos-site.client";
import {
  catalogArtworkIssues,
  catalogCardCopy,
  catalogCardFingerprint,
  artworkFormat,
  catalogDraft,
  catalogHeadlineIssue,
  catalogExportRows,
  type CatalogCard,
  type CatalogDraft,
  type CatalogExport,
  type CatalogHome,
  type CatalogOverrides,
  type CatalogTemplateId,
  type CatalogFormatId,
  DEFAULT_CATALOG_FORMAT,
  DEFAULT_CATALOG_TEMPLATE,
} from "@/lib/catalog-studio";
import { brandWideAmenities } from "@/lib/catalog-copy";
import {
  COMPOSITION_IMAGE_POSITIONS,
  COMPOSITION_TEMPLATES,
  compositionTemplateIdSchema,
  getCompositionIdentity,
  type CompositionFormatId,
} from "@/lib/compositions";
import { brandHomeInventory } from "./home-inventory.service";
import { ingestBrandHomes } from "./homes.service";
import { brandWebsiteId } from "./wanderos-listings.service";
import { freezeComposition } from "./composition.service";
import { importRemoteImage } from "./media.service";

const PROVIDER = "catalog-export";
export async function catalogBrand(userId: string, brandId: string) {
  const [brand] = await db
    .select({
      id: brandTable.id,
      name: brandTable.name,
      slug: brandTable.slug,
      website: brandTable.website,
      organizationId: memberTable.organizationId,
      settings: brandTable.performanceSettings,
      markets: brandTable.markets,
      logo: brandTable.logo,
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
type CatalogBrand = Awaited<ReturnType<typeof catalogBrand>>;

/**
 * An approved card is signed off as it stands, and the export ships only
 * signed-off cards. `force` lets a local dev server change or export anyway,
 * to try versions; deployed, it is ignored.
 */
export const catalogLockBypass = (force?: boolean) =>
  Boolean(force) && process.env.NODE_ENV === "development";

export function assertCardOpen(
  card: Pick<CatalogCard, "approved"> | null | undefined,
  force?: boolean,
) {
  if (card?.approved && !catalogLockBypass(force))
    throw new Error("This card is approved. Reopen it before changing it.");
}

/** Every home row on the brand, by its listing id. */
async function catalogRows(brandId: string) {
  const rows = await db.query.homeTable.findMany({
    where: and(eq(homeTable.brandId, brandId), isNull(homeTable.deletedAt)),
    columns: {
      id: true,
      externalId: true,
      amenities: true,
      description: true,
      galleryCache: true,
      rating: true,
      catalogTitle: true,
      catalogSubtitle: true,
      catalogTemplateId: true,
      catalogImagePosition: true,
      catalogShowLogo: true,
      catalogImageAssetId: true,
      catalogMode: true,
      catalogFinishedAssetId: true,
      catalogExcluded: true,
      catalogApproval: true,
      catalogPills: true,
    },
  });
  return new Map(rows.map((row) => [row.externalId, row]));
}
type CatalogRow = NonNullable<
  ReturnType<Awaited<ReturnType<typeof catalogRows>>["get"]>
>;

function overridesOf(
  row: CatalogRow,
  assets: ReadonlyMap<string, string>,
  formats: ReadonlyMap<string, CompositionFormatId | null>,
): CatalogOverrides {
  const asset = (id: string | null) =>
    id && assets.get(id) ? { assetId: id, url: assets.get(id)! } : null;
  const template = compositionTemplateIdSchema.safeParse(row.catalogTemplateId);
  const position = COMPOSITION_IMAGE_POSITIONS.find(
    (p) => p === row.catalogImagePosition,
  );
  const finished = asset(row.catalogFinishedAssetId);
  return {
    title: row.catalogTitle,
    subtitle: row.catalogSubtitle,
    templateId: template.success ? template.data : null,
    imagePosition: position ?? null,
    showLogo: row.catalogShowLogo,
    image: asset(row.catalogImageAssetId),
    mode:
      row.catalogMode === "finished" || row.catalogMode === "compose"
        ? row.catalogMode
        : null,
    finished: finished && {
      ...finished,
      format: formats.get(finished.assetId) ?? null,
    },
    excluded: row.catalogExcluded,
    pills: row.catalogPills,
  };
}

/**
 * The brand's homes as the catalog reads them: the feed inventory for facts
 * and addresses, each home's row for its gallery, amenities and card
 * overrides, and the cards built from both.
 */
async function catalogHomes(brand: CatalogBrand, refresh = false) {
  const inventory = await brandHomeInventory(brand, refresh);
  let rows = await catalogRows(brand.id);
  // A brand not yet ingested, or a listing new since the last ingest, gets
  // its rows on first read so every card has somewhere to keep an edit.
  if (inventory.homes.some((home) => !rows.has(home.id))) {
    await ingestBrandHomes({ brandId: brand.id, website: brand.website });
    rows = await catalogRows(brand.id);
  }
  const homes: CatalogHome[] = inventory.homes.map((home) => {
    const row = rows.get(home.id);
    return row
      ? {
          ...home,
          amenities: row.amenities ?? home.amenities,
          gallery: row.galleryCache ?? home.gallery,
          // Ingestion keeps the rating on the row; the cached inventory can
          // predate it.
          rating: row.rating ?? home.rating,
        }
      : home;
  });
  const assetIds = [...rows.values()].flatMap((row) =>
    [row.catalogImageAssetId, row.catalogFinishedAssetId].filter(
      (id): id is string => Boolean(id),
    ),
  );
  const assets = assetIds.length
    ? await db.query.mediaAssetTable.findMany({
        where: and(
          inArray(mediaAssetTable.id, assetIds),
          eq(mediaAssetTable.brandId, brand.id),
          isNull(mediaAssetTable.deletedAt),
        ),
        columns: { id: true, url: true, width: true, height: true },
      })
    : [];
  const urls = new Map(
    assets.flatMap((a) => (a.url ? [[a.id, a.url] as const] : [])),
  );
  const formats = new Map(
    assets.map((a) => [a.id, artworkFormat(a.width, a.height)] as const),
  );
  const overrides = new Map(
    [...rows.values()].map((row) => [
      row.externalId,
      overridesOf(row, urls, formats),
    ]),
  );
  const approvals = new Map(
    [...rows.values()].flatMap((row) =>
      row.catalogApproval
        ? [[row.externalId, row.catalogApproval.fingerprint] as const]
        : [],
    ),
  );
  const draft = catalogDraft(
    homes,
    overrides,
    approvals,
    brand.settings?.catalogTemplateId ?? DEFAULT_CATALOG_TEMPLATE,
    brand.markets,
    DEFAULT_CATALOG_FORMAT,
  );
  // Cards still on the starter headline that nobody wrote, approved or gave
  // supplied artwork: what "Write all cards" works through.
  const unwritten = draft.cards
    .filter(
      (card) =>
        card.included &&
        !card.approved &&
        card.mode !== "finished" &&
        !rows.get(card.homeId)?.catalogTitle,
    )
    .map((card) => card.homeId);
  return { inventory, homes, rows, draft, unwritten };
}

/** The homes whose cards go out: brand-wide reads count only these. */
export function includedHomes(
  homes: readonly CatalogHome[],
  draft: { cards: readonly CatalogCard[] },
) {
  const ids = new Set(
    draft.cards.filter((card) => card.included).map((card) => card.homeId),
  );
  return homes.filter((home) => ids.has(home.id));
}

export async function catalogState(
  userId: string,
  brandId: string,
  refresh = false,
) {
  const brand = await catalogBrand(userId, brandId);
  const { inventory, homes, draft, unwritten } = await catalogHomes(
    brand,
    refresh,
  );
  const runs = await db.query.creativeRunTable.findMany({
    where: and(
      eq(creativeRunTable.brandId, brandId),
      eq(creativeRunTable.provider, PROVIDER),
    ),
    orderBy: [desc(creativeRunTable.createdAt)],
  });
  return {
    homes,
    enrichmentError: inventory.enrichmentError,
    syncedAt: inventory.syncedAt,
    defaultTemplate:
      brand.settings?.catalogTemplateId ?? DEFAULT_CATALOG_TEMPLATE,
    format: DEFAULT_CATALOG_FORMAT,
    draft,
    unwritten,
    exports: runs.map((run): CatalogExport => ({
      ...run.providerOutput,
      id: run.id,
      status: run.status,
      error: run.error,
      createdAt: run.createdAt.toISOString(),
      label: exportLabel(run.input),
    })),
  };
}

/** What an export's cards are, from the draft it froze: "Catalog · destination". */
function exportLabel(input: unknown) {
  const cards = (input as { draft?: { cards?: CatalogCard[] } } | null)?.draft
    ?.cards;
  if (!cards?.length) return undefined;
  const kinds = new Set(
    cards
      .filter((card) => card.included)
      .map((card) =>
        card.mode === "finished"
          ? "Supplied artwork"
          : (COMPOSITION_TEMPLATES.find((t) => t.id === card.templateId)
              ?.label ?? card.templateId),
      ),
  );
  return [...kinds].join(" + ");
}

/**
 * One home as the catalog chat works on it: its card, and every photo on its
 * listing in the site's own order. Photo numbers are 1-based positions in
 * `photos`, the same numbers the contact sheets print.
 */
export async function catalogHomeContext(
  userId: string,
  brandId: string,
  homeId: string,
) {
  const brand = await catalogBrand(userId, brandId);
  const { homes, rows, draft } = await catalogHomes(brand);
  const home = homes.find((h) => h.id === homeId);
  const row = rows.get(homeId);
  if (!home || !row)
    throw new Error("That home is not on this brand's catalog");
  // The live detail carries room names the cached gallery does not.
  const websiteId = await brandWebsiteId(brand.id);
  const detail = websiteId
    ? await fetchWanderOsListingDetail({ websiteId, propertyId: home.id })
    : null;
  const photos: { url: string; thumbUrl: string; room: string | null }[] =
    detail?.photos.length
      ? detail.photos
      : (row.galleryCache ?? home.gallery ?? []).map((photo) => ({
          ...photo,
          room: null,
        }));
  return {
    brand,
    home,
    rowId: row.id,
    card: draft.cards.find((c) => c.homeId === home.id) ?? null,
    photos,
    description: row.description ?? detail?.description ?? null,
    amenities: row.amenities ?? detail?.amenities ?? home.amenities ?? [],
    locationDescription: detail?.locationDescription ?? null,
    petsAllowed: detail?.petsAllowed ?? null,
    siblings: draft.cards.flatMap((card) =>
      card.included && card.homeId !== home.id
        ? [
            {
              name: homes.find((h) => h.id === card.homeId)?.name ?? "",
              headline: card.title,
            },
          ]
        : [],
    ),
    brandWide: brandWideAmenities(includedHomes(homes, draft)),
  };
}

/**
 * What each home's listing says, for writing its card: the full amenity list,
 * the description, what it is near and whether pets are welcome. The chat
 * reads this rather than the public page, which shows only the first few
 * amenities before "Show all".
 */
export async function catalogHomeFacts(
  userId: string,
  brandId: string,
  homeIds: readonly string[],
) {
  const brand = await catalogBrand(userId, brandId);
  const { homes, rows, draft } = await catalogHomes(brand);
  const websiteId = await brandWebsiteId(brand.id);
  const wanted = homes.filter((home) => homeIds.includes(home.id));
  const out = [];
  // Eight at a time, as the inventory sync reads the same endpoint.
  for (let i = 0; i < wanted.length; i += 8) {
    const batch = await Promise.all(
      wanted.slice(i, i + 8).map(async (home) => {
        const row = rows.get(home.id);
        const detail = websiteId
          ? await fetchWanderOsListingDetail({ websiteId, propertyId: home.id })
          : null;
        return {
          homeId: home.id,
          name: home.name,
          url: home.url,
          headline:
            draft.cards.find((c) => c.homeId === home.id)?.title ?? null,
          bedrooms: home.bedrooms ?? null,
          bathrooms: home.bathrooms ?? null,
          guests: home.guests ?? null,
          petsAllowed: detail?.petsAllowed ?? null,
          amenities:
            row?.amenities ?? detail?.amenities ?? home.amenities ?? [],
          description:
            (row?.description ?? detail?.description)?.slice(0, 1500) ?? null,
          locationDescription:
            detail?.locationDescription?.slice(0, 800) ?? null,
        };
      }),
    );
    out.push(...batch);
  }
  return {
    homes: out,
    unknown: homeIds.filter((id) => !wanted.some((h) => h.id === id)),
  };
}

/**
 * Make one of the home's photos its hero. The hero belongs to the home, so
 * ads, previews and the catalog all move with it; a catalog card that had its
 * own library pick gives it up, because the operator just chose a photo.
 */
export async function setCatalogHomeHero(input: {
  userId: string;
  brandId: string;
  homeId: string;
  /** The contact-sheet number (chat), or the photo's URL (the editor). */
  photo: { number: number } | { url: string };
  force?: boolean;
}) {
  const ctx = await catalogHomeContext(
    input.userId,
    input.brandId,
    input.homeId,
  );
  assertCardOpen(ctx.card, input.force);
  const wanted = input.photo;
  const photo =
    "number" in wanted
      ? ctx.photos[wanted.number - 1]
      : [...ctx.photos, ...(ctx.home.gallery ?? [])].find(
          (p) => p.url === wanted.url,
        );
  if (!photo)
    throw new Error(
      "number" in wanted
        ? `Photo ${wanted.number} is not in ${ctx.home.name}'s gallery (1–${ctx.photos.length})`
        : `That photo is not in ${ctx.home.name}'s gallery`,
    );
  await db
    .update(homeTable)
    .set({ heroSourceUrl: photo.url, catalogImageAssetId: null })
    .where(eq(homeTable.id, ctx.rowId));
  const photoNumber = ctx.photos.findIndex((p) => p.url === photo.url) + 1;
  return {
    homeId: ctx.home.id,
    homeName: ctx.home.name,
    photoNumber: photoNumber || null,
    room: "room" in photo ? (photo.room ?? null) : null,
    heroUrl: photo.url,
  };
}

/** A change to one card. Null puts a field back on its default. */
export type CatalogCardPatch = {
  title?: string | null;
  subtitle?: string | null;
  templateId?: CatalogCard["templateId"] | null;
  imagePosition?: CatalogCard["imagePosition"] | null;
  showLogo?: boolean | null;
  included?: boolean;
  mode?: "compose" | "finished" | null;
  /** A library image to draw the card on instead of the hero. */
  imageAssetId?: string | null;
  /** Supplied artwork for a finished card. */
  finishedAssetId?: string | null;
  /** Amenity pills for the amenities cards. */
  pills?: string[] | null;
};

/** Change one home's catalog card on its row. */
export async function editCatalogCard(input: {
  userId: string;
  brandId: string;
  homeId: string;
  patch: CatalogCardPatch;
  /** Mark the card as reviewed in the state this edit leaves it in. */
  approved?: boolean;
  force?: boolean;
}) {
  const brand = await catalogBrand(input.userId, input.brandId);
  const { patch } = input;
  // Taking a card in or out of the export is not a change to what it shows.
  if (Object.keys(patch).some((key) => key !== "included")) {
    const { draft } = await catalogHomes(brand);
    assertCardOpen(
      draft.cards.find((c) => c.homeId === input.homeId),
      input.force,
    );
  }
  for (const id of [patch.imageAssetId, patch.finishedAssetId])
    if (id) await finishedCatalogAsset(brand.id, id);
  const title = patch.title?.trim();
  if (title !== undefined && (!title || title.length > 120))
    throw new Error("A headline is 1–120 characters");
  if (patch.subtitle && patch.subtitle.length > 220)
    throw new Error("The facts line is at most 220 characters");
  if (
    patch.pills &&
    (patch.pills.length > 4 ||
      patch.pills.some((p) => !p.trim() || p.length > 24))
  )
    throw new Error("Up to four amenity pills, each at most 24 characters");
  if (title) {
    const row = await db.query.homeTable.findFirst({
      where: and(
        eq(homeTable.brandId, brand.id),
        eq(homeTable.externalId, input.homeId),
        isNull(homeTable.deletedAt),
      ),
      columns: { catalogTemplateId: true },
    });
    const template = compositionTemplateIdSchema.safeParse(
      patch.templateId !== undefined
        ? patch.templateId
        : row?.catalogTemplateId,
    );
    const issue = catalogHeadlineIssue(
      title,
      template.success ? template.data : DEFAULT_CATALOG_TEMPLATE,
    );
    if (issue) throw new Error(issue);
  }
  const set = {
    ...(patch.title !== undefined ? { catalogTitle: title ?? null } : {}),
    ...(patch.subtitle !== undefined
      ? { catalogSubtitle: patch.subtitle }
      : {}),
    ...(patch.templateId !== undefined
      ? { catalogTemplateId: patch.templateId }
      : {}),
    ...(patch.imagePosition !== undefined
      ? { catalogImagePosition: patch.imagePosition }
      : {}),
    ...(patch.showLogo !== undefined
      ? { catalogShowLogo: patch.showLogo }
      : {}),
    ...(patch.included !== undefined
      ? { catalogExcluded: !patch.included }
      : {}),
    ...(patch.mode !== undefined ? { catalogMode: patch.mode } : {}),
    ...(patch.imageAssetId !== undefined
      ? { catalogImageAssetId: patch.imageAssetId }
      : {}),
    ...(patch.finishedAssetId !== undefined
      ? { catalogFinishedAssetId: patch.finishedAssetId }
      : {}),
    ...(patch.pills !== undefined ? { catalogPills: patch.pills } : {}),
  };
  if (Object.keys(set).length) {
    const [updated] = await db
      .update(homeTable)
      .set(set)
      .where(
        and(
          eq(homeTable.brandId, brand.id),
          eq(homeTable.externalId, input.homeId),
          isNull(homeTable.deletedAt),
        ),
      )
      .returning({ id: homeTable.id });
    if (!updated) throw new Error("That home has no catalog card");
  }
  const { draft } = await catalogHomes(brand);
  const card = draft.cards.find((c) => c.homeId === input.homeId);
  if (!card) throw new Error("That home has no catalog card");
  if (input.approved !== undefined)
    await db
      .update(homeTable)
      .set({
        catalogApproval: input.approved
          ? {
              approvedAt: new Date().toISOString(),
              approvedBy: input.userId,
              fingerprint: catalogCardFingerprint(card),
            }
          : null,
      })
      .where(
        and(
          eq(homeTable.brandId, brand.id),
          eq(homeTable.externalId, input.homeId),
          isNull(homeTable.deletedAt),
        ),
      );
  return {
    approved: input.approved ?? card.approved,
    homeId: card.homeId,
    title: card.title,
    subtitle: card.subtitle,
    templateId: card.templateId,
    imagePosition: card.imagePosition,
    showLogo: card.showLogo,
    included: card.included,
  };
}

/**
 * Sign cards off exactly as the operator saw them, or take the sign-off back.
 * Each approval carries the fingerprint of the card on screen; a card the
 * chat changed since is refused rather than approved unseen. A card that
 * changes later is unreviewed again on its own.
 */
export async function setCatalogApproval(input: {
  userId: string;
  brandId: string;
  approved: boolean;
  cards: readonly { homeId: string; fingerprint?: string }[];
}) {
  const brand = await catalogBrand(input.userId, input.brandId);
  const { homes, draft } = await catalogHomes(brand);
  const cards = input.cards.flatMap((seen) => {
    const card = draft.cards.find((c) => c.homeId === seen.homeId);
    if (!card) return [];
    if (input.approved && seen.fingerprint !== catalogCardFingerprint(card))
      throw new Error(
        `${homes.find((h) => h.id === card.homeId)?.name ?? "A card"} changed since you looked at it. Review it again.`,
      );
    return [card];
  });
  const approvedAt = new Date().toISOString();
  for (const card of cards)
    await db
      .update(homeTable)
      .set({
        catalogApproval: input.approved
          ? {
              approvedAt,
              approvedBy: input.userId,
              fingerprint: catalogCardFingerprint(card),
            }
          : null,
      })
      .where(
        and(
          eq(homeTable.brandId, brand.id),
          eq(homeTable.externalId, card.homeId),
          isNull(homeTable.deletedAt),
        ),
      );
  return { updated: cards.length };
}

/** The catalog card every home uses unless it has its own. */
export async function setCatalogDefaultTemplate(input: {
  userId: string;
  brandId: string;
  templateId: CatalogTemplateId;
}) {
  const brand = await catalogBrand(input.userId, input.brandId);
  await db
    .update(brandTable)
    .set({
      performanceSettings: sql`coalesce(${brandTable.performanceSettings}, '{}'::jsonb) || ${JSON.stringify({ catalogTemplateId: input.templateId, updatedAt: new Date().toISOString(), updatedBy: input.userId })}::jsonb`,
    })
    .where(eq(brandTable.id, brand.id));
}

/** Include or exclude every home in the brand's catalog at once. */
export async function setCatalogIncluded(input: {
  userId: string;
  brandId: string;
  included: boolean;
}) {
  const brand = await catalogBrand(input.userId, input.brandId);
  await db
    .update(homeTable)
    .set({ catalogExcluded: !input.included })
    .where(and(eq(homeTable.brandId, brand.id), isNull(homeTable.deletedAt)));
}

/** Freeze the catalog as it stands on the rows into a new export run. */
export async function startCatalogExport(
  userId: string,
  brandId: string,
  force?: boolean,
) {
  const brand = await catalogBrand(userId, brandId);
  const { homes, draft } = await catalogHomes(brand);
  const included = draft.cards.filter((c) => c.included);
  if (!included.length) throw new Error("Include at least one home");
  const unapproved = included.filter((c) => !c.approved).length;
  if (unapproved && !catalogLockBypass(force))
    throw new Error(
      `Approve every included card before exporting: ${unapproved} not approved yet.`,
    );
  const artworkIssues = catalogArtworkIssues(draft);
  if (artworkIssues.length) throw new Error(artworkIssues.join(" · "));
  for (const card of included.filter((c) => c.mode === "finished")) {
    await finishedCatalogAsset(brandId, card.finishedArtwork!.assetId);
  }
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
  return { run: run!, brand, homes, draft };
}
export async function renderCatalogExport(
  input: Awaited<ReturnType<typeof startCatalogExport>> & { fresh?: boolean },
  userId: string,
) {
  const { run, brand, homes, draft } = input;
  const assets: NonNullable<CatalogExport["assets"]> = [];
  let folderId: string | undefined;
  const total =
    draft.cards.filter((c) => c.included).length * draft.formats.length;
  try {
    await db
      .update(creativeRunTable)
      .set({ status: "processing" })
      .where(eq(creativeRunTable.id, run.id));
    const [folder] = await db
      .insert(mediaFolderTable)
      .values({
        brandId: brand.id,
        name: `Catalog · ${draft.formats.join(" + ")} · ${new Date().toISOString().slice(0, 19).replace("T", " ")} UTC`,
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
    const previous = await previousRenders(brand.id, input.fresh);
    for (const card of draft.cards.filter((c) => c.included)) {
      const home = homes.find((h) => h.id === card.homeId)!;
      const finished =
        card.mode === "finished"
          ? await finishedCatalogAsset(brand.id, card.finishedArtwork!.assetId)
          : null;
      let sourceId = finished?.id ?? card.assetId;
      for (const format of draft.formats) {
        const spec = {
          brandId: brand.id,
          sourceMediaAssetId: card.assetId ?? undefined,
          templateId: card.templateId,
          formatId: format,
          ...catalogCardCopy(card),
          imagePosition: card.imagePosition,
          mark: card.showLogo ? ("auto" as const) : ("none" as const),
          // The renderer appends the format to the filename.
          assetTitle: `${home.name} · Catalog`,
        };
        // Everything the renderer draws from: an unchanged card reuses the
        // last export's image instead of drawing it again.
        const renderKey = finished
          ? undefined
          : JSON.stringify([
              getCompositionIdentity(spec),
              // Pills and location draw but sit outside the identity.
              catalogCardCopy(card),
              card.imageUrl,
              brand.logo,
            ]);
        const reused = renderKey ? previous.get(renderKey) : undefined;
        if (!finished && !reused && !sourceId)
          sourceId = (
            await importRemoteImage({
              brandId: brand.id,
              uploadedBy: userId,
              url: card.imageUrl,
              title: `${home.name} · Catalog source`,
            })
          ).id;
        const asset = finished
          ? await importRemoteImage({
              brandId: brand.id,
              uploadedBy: userId,
              url: finished.url!,
              filename: finished.filename ?? undefined,
              width: finished.width ?? undefined,
              height: finished.height ?? undefined,
              title: `${home.name} · Catalog · Finished artwork`,
            })
          : reused
            ? // A copy, not the same row: deleting one export's image
              // deletes its file.
              await importRemoteImage({
                brandId: brand.id,
                uploadedBy: userId,
                url: reused.url!,
                filename: `${spec.assetTitle}-${format}.${reused.filename?.split(".").pop() ?? "png"}`,
                width: reused.width ?? undefined,
                height: reused.height ?? undefined,
                title: spec.assetTitle,
              })
            : await freezeComposition({
                userId,
                spec: { ...spec, sourceMediaAssetId: sourceId },
              });
        if (!asset.url) throw new Error(`No image URL for ${home.name}`);
        await db
          .update(mediaAssetTable)
          .set({
            folderId,
            ...(reused ? { alt: reused.alt, metadata: reused.metadata } : {}),
          })
          .where(eq(mediaAssetTable.id, asset.id));
        assets.push({
          homeId: home.id,
          name: home.name,
          assetId: asset.id,
          url: asset.url,
          format,
          ...(renderKey ? { renderKey } : {}),
          ...(reused ? { reused: true } : {}),
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
/** The last ready export's images by what they were drawn from. */
async function previousRenders(brandId: string, fresh = false) {
  const none = new Map<string, typeof mediaAssetTable.$inferSelect>();
  if (fresh) return none;
  const run = await db.query.creativeRunTable.findFirst({
    where: and(
      eq(creativeRunTable.brandId, brandId),
      eq(creativeRunTable.provider, PROVIDER),
      eq(creativeRunTable.status, "ready"),
    ),
    orderBy: (r, { desc }) => [desc(r.createdAt)],
    columns: { providerOutput: true },
  });
  const keyed = (
    (run?.providerOutput as CatalogExport | null)?.assets ?? []
  ).filter((a) => a.renderKey);
  if (!keyed.length) return none;
  const rows = await db.query.mediaAssetTable.findMany({
    where: and(
      eq(mediaAssetTable.brandId, brandId),
      inArray(
        mediaAssetTable.id,
        keyed.map((a) => a.assetId),
      ),
      eq(mediaAssetTable.status, "ready"),
      isNull(mediaAssetTable.deletedAt),
    ),
  });
  return new Map(
    keyed.flatMap((a) => {
      const row = rows.find((r) => r.id === a.assetId);
      return row?.url ? [[a.renderKey!, row] as const] : [];
    }),
  );
}
export async function catalogExport(
  userId: string,
  brandId: string,
  runId: string,
) {
  const brand = await catalogBrand(userId, brandId);
  const run = await db.query.creativeRunTable.findFirst({
    where: and(
      eq(creativeRunTable.id, runId),
      eq(creativeRunTable.brandId, brandId),
      eq(creativeRunTable.provider, PROVIDER),
      eq(creativeRunTable.status, "ready"),
    ),
  });
  if (!run) throw new Error("Completed export not found");
  const { draft } = run.input as { draft: CatalogDraft };
  return {
    ...(run.providerOutput as unknown as Required<
      Pick<CatalogExport, "rows" | "assets" | "folderId">
    >),
    brand,
    formats: draft.formats,
    createdAt: run.createdAt,
  };
}

async function finishedCatalogAsset(brandId: string, assetId: string) {
  const asset = await db.query.mediaAssetTable.findFirst({
    where: and(
      eq(mediaAssetTable.id, assetId),
      eq(mediaAssetTable.brandId, brandId),
      eq(mediaAssetTable.kind, "image"),
      eq(mediaAssetTable.status, "ready"),
      eq(mediaAssetTable.provider, "r2"),
      isNull(mediaAssetTable.deletedAt),
    ),
  });
  if (!asset?.url)
    throw new Error(
      "Choose ready finished artwork from this brand’s media library",
    );
  return asset;
}
