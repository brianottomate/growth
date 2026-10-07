import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/server/db";
import {
  adTable,
  brandTable,
  campaignTable,
  catalogExportTable,
  mediaAssetTable,
} from "@/server/db/schema";
import { env } from "@/env";
import {
  adPreviewAd,
  type AdPreviewCatalogCard,
  type createAdPreviewLinkInput,
} from "@/lib/ad-preview";
import type { CatalogDraft } from "@/lib/catalog-studio";
import { freezeApprovedAd } from "./ad-approval.service";
import { ensureBrandConnect } from "./brand-connect.service";

/**
 * The link is self-contained: brand, one campaign, one catalog export and an
 * expiry, signed with a key derived from the auth secret and the brand's
 * connect token. Nothing is stored, so there is no table and no migration.
 * Regenerating the brand's connect link revokes every preview link it has,
 * the same way it revokes the connect link itself.
 */
type PreviewClaims = {
  b: string;
  c: string | null;
  x: string | null;
  e: number;
};

function signingKey() {
  const secret = env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not configured");
  return createHmac("sha256", secret).update("growth:ad-preview:v3").digest();
}
function signature(payload: string, brandToken: string) {
  return createHmac("sha256", signingKey())
    .update(`${payload}.${brandToken}`)
    .digest();
}
function signToken(claims: PreviewClaims, brandToken: string) {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${signature(payload, brandToken).toString("base64url")}`;
}
/** The claims of a genuine, unexpired link, or null. */
async function readToken(token: string): Promise<PreviewClaims | null> {
  const [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra !== undefined || token.length > 1000)
    return null;
  let claims: PreviewClaims;
  try {
    claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as PreviewClaims;
  } catch {
    return null;
  }
  if (
    typeof claims.b !== "string" ||
    typeof claims.e !== "number" ||
    claims.e < Date.now()
  )
    return null;
  // The claims are untrusted until the signature checks out against the
  // brand's current connect token; a missing brand or token fails it.
  const brand = await db.query.brandTable.findFirst({
    where: and(eq(brandTable.id, claims.b), isNull(brandTable.deletedAt)),
    columns: { connectToken: true },
  });
  if (!brand?.connectToken) return null;
  const given = Buffer.from(sig, "base64url");
  const expected = signature(payload, brand.connectToken);
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    return null;
  return claims;
}

/** The mark the feed mocks wear, resolved the way the studio resolves it. */
async function brandAvatar(brand: typeof brandTable.$inferSelect) {
  if (!brand.brandMark) return brand.logo;
  if (brand.brandMark.vector?.color)
    return `data:image/svg+xml;base64,${Buffer.from(brand.brandMark.vector.color).toString("base64")}`;
  const asset = await db.query.mediaAssetTable.findFirst({
    where: eq(mediaAssetTable.id, brand.brandMark.variants.color),
    columns: { url: true },
  });
  return asset?.url ?? brand.logo;
}

async function ownedBrand(orgId: string, brandId: string) {
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, brandId),
      eq(brandTable.organizationId, orgId),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true },
  });
  if (!brand) throw new Error("Brand not found in this workspace");
  return brand;
}

/** What a preview link can be made from: campaigns with approved ads, and exports. */
export async function adPreviewOptions(orgId: string, brandId: string) {
  await ownedBrand(orgId, brandId);
  const [campaigns, ads, exports] = await Promise.all([
    db.query.campaignTable.findMany({
      where: eq(campaignTable.brandId, brandId),
      columns: { id: true, name: true, status: true },
      orderBy: desc(campaignTable.createdAt),
    }),
    db.query.adTable.findMany({
      where: and(eq(adTable.brandId, brandId), eq(adTable.status, "approved")),
      columns: { id: true, campaignId: true, replacesAdId: true },
    }),
    db.query.catalogExportTable.findMany({
      where: eq(catalogExportTable.brandId, brandId),
      columns: { id: true, createdAt: true, output: true },
      orderBy: desc(catalogExportTable.createdAt),
      limit: 10,
    }),
  ]);
  return {
    campaigns: campaigns
      .map((campaign) => ({
        ...campaign,
        approved: ads.filter((ad) => ad.campaignId === campaign.id).length,
      }))
      .filter((campaign) => campaign.approved > 0),
    catalogExports: exports.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      cards: (row.output as { completed?: number }).completed ?? 0,
    })),
  };
}

/**
 * A link to one campaign's approved ads and one catalog export. Each ad's
 * images are saved first, as its approver, so the page only points at
 * public files and never renders on view. The catalog is already frozen.
 */
export async function createAdPreviewLink(
  orgId: string,
  input: z.infer<typeof createAdPreviewLinkInput>,
) {
  const brand = await ownedBrand(orgId, input.brandId);
  if (input.campaignId) {
    const campaign = await db.query.campaignTable.findFirst({
      where: and(
        eq(campaignTable.id, input.campaignId),
        eq(campaignTable.brandId, brand.id),
      ),
      columns: { id: true },
    });
    if (!campaign) throw new Error("Campaign not found for this brand");
    const approved = await db.query.adTable.findMany({
      where: and(
        eq(adTable.campaignId, campaign.id),
        eq(adTable.status, "approved"),
      ),
      columns: { id: true },
    });
    if (!approved.length)
      throw new Error("This campaign has no approved ads yet.");
    for (const ad of approved) await freezeApprovedAd(ad.id);
  }
  if (input.catalogExportId) {
    const exported = await db.query.catalogExportTable.findFirst({
      where: and(
        eq(catalogExportTable.id, input.catalogExportId),
        eq(catalogExportTable.brandId, brand.id),
      ),
      columns: { id: true },
    });
    if (!exported) throw new Error("Catalog export not found for this brand");
  }
  const expiresAt = Date.now() + input.expiresInDays * 86_400_000;
  const { token: brandToken } = await ensureBrandConnect(brand.id);
  const token = signToken(
    {
      b: brand.id,
      c: input.campaignId,
      x: input.catalogExportId,
      e: expiresAt,
    },
    brandToken,
  );
  return {
    url: `${env.NEXT_PUBLIC_BASE_URL}/ad-preview/${token}`,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

/** The catalog as one export froze it, in the export's primary format. */
async function frozenCatalog(brandId: string, exportId: string) {
  const row = await db.query.catalogExportTable.findFirst({
    where: and(
      eq(catalogExportTable.id, exportId),
      eq(catalogExportTable.brandId, brandId),
    ),
  });
  if (!row) return null;
  const { draft } = row.input as { draft: CatalogDraft };
  const output = row.output as {
    assets?: { homeId: string; name: string; url: string; format: string }[];
    rows?: { id: string; title: string; description: string }[];
    primaryFormat?: string;
  };
  const format = output.primaryFormat ?? draft.primaryFormat;
  // The export's own feed rows: exactly what it sends Meta under each card.
  const feed = new Map((output.rows ?? []).map((r) => [r.id, r]));
  const cards: AdPreviewCatalogCard[] = (output.assets ?? [])
    .filter((asset) => asset.format === format && feed.has(asset.homeId))
    .map((asset) => ({
      key: asset.homeId,
      image: asset.url,
      headline: feed.get(asset.homeId)!.title,
      description: feed.get(asset.homeId)!.description,
    }));
  return {
    exportedAt: row.createdAt.toISOString(),
    ad: draft.ad ?? null,
    cards,
  };
}

/**
 * Everything the public page draws. Campaign ads are read live, so an ad
 * reopened since the link was made drops off rather than showing stale art;
 * the catalog is the export, which never changes.
 */
export async function loadAdPreviewPage(token: string) {
  const claims = await readToken(token);
  if (!claims) return null;
  const brand = await db.query.brandTable.findFirst({
    where: and(eq(brandTable.id, claims.b), isNull(brandTable.deletedAt)),
  });
  if (!brand) return null;
  const [campaign, catalog, brandLogo] = await Promise.all([
    claims.c
      ? db.query.campaignTable.findFirst({
          where: and(
            eq(campaignTable.id, claims.c),
            eq(campaignTable.brandId, brand.id),
          ),
          columns: { id: true, name: true },
        })
      : null,
    claims.x ? frozenCatalog(brand.id, claims.x) : null,
    brandAvatar(brand),
  ]);
  const rows = campaign
    ? await db.query.adTable.findMany({
        where: and(
          eq(adTable.campaignId, campaign.id),
          eq(adTable.status, "approved"),
        ),
        with: { home: { columns: { name: true } } },
        orderBy: (ad, { asc }) => [asc(ad.createdAt)],
      })
    : [];
  const ads = rows.flatMap((row) => {
    const ad = adPreviewAd({ ...row, homeName: row.home?.name });
    return ad ? [{ id: row.id, ...ad }] : [];
  });
  if (!ads.length && !catalog?.cards.length) return null;
  return {
    brandName: brand.name,
    brandLogo,
    expiresAt: new Date(claims.e).toISOString(),
    campaign: campaign ? { name: campaign.name, ads } : null,
    catalog: catalog?.cards.length ? catalog : null,
  };
}
export type AdPreviewPage = NonNullable<
  Awaited<ReturnType<typeof loadAdPreviewPage>>
>;

/** Every image URL the page may draw, for the same-origin media route. */
export function adPreviewImageUrls(preview: AdPreviewPage) {
  const urls = new Set<string>();
  for (const ad of preview.campaign?.ads ?? [])
    if (ad.kind === "creative")
      for (const placement of ad.placements)
        for (const item of placement.media) {
          urls.add(item.url);
          if (item.thumbnail) urls.add(item.thumbnail);
        }
  for (const card of preview.catalog?.cards ?? []) urls.add(card.image);
  if (preview.brandLogo?.startsWith("https://")) urls.add(preview.brandLogo);
  return urls;
}
