import Link from "next/link";
import { redirect } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { and, count, eq, inArray, isNull, max } from "drizzle-orm";

import { db } from "@/server/db";
import {
  audienceTargetTable,
  brandInspirationTable,
  brandTable,
  channelSuggestionTable,
  channelTable,
  memberTable,
  platformPostTable,
} from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { BrandChannels, type ChannelLite } from "./BrandChannels";
import { BrandAudiences } from "./BrandAudiences";
import { BrandLinks } from "./BrandLinks";
import { BrandActions } from "./BrandActions";
import { NewBrandButton } from "./NewBrandButton";
import { ImportZernioBrands } from "./ImportZernioBrands";
import { TrackedBrands, type TrackedLite } from "./TrackedBrands";
import { SuggestedChannels, type SuggestionLite } from "./SuggestedChannels";
import { PeerScrapeButton } from "./PeerScrapeButton";
import { AmplifierRolodex } from "./AmplifierRolodex";
import { ChannelLogo, platformLabel } from "@/components/channel-logos";

const compactFmt = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function BrandCard({
  brand,
  channels,
  tracked,
  suggestions,
  audienceCount,
  postCount,
  postCountByPlatform,
}: {
  brand: typeof brandTable.$inferSelect;
  channels: ChannelLite[];
  tracked: TrackedLite[];
  suggestions: SuggestionLite[];
  audienceCount: number;
  postCount: number;
  postCountByPlatform: Record<string, number>;
}) {
  const socialReach = channels
    .filter((c) => c.kind === "social")
    .reduce((sum, c) => sum + (c.followerCount ?? 0), 0);
  const adCount = channels.filter((c) => c.kind === "ad").length;
  const summary = [
    socialReach > 0 && `${compactFmt.format(socialReach)} reach`,
    channels.length > 0 && `${channels.length} channels`,
    adCount > 0 && `${adCount} ad ${adCount === 1 ? "account" : "accounts"}`,
    audienceCount > 0 &&
      `${audienceCount} ${audienceCount === 1 ? "audience" : "audiences"}`,
    postCount > 0 && `${compactFmt.format(postCount)} posts`,
  ].filter(Boolean) as string[];

  return (
    <div className="bg-card rounded-2xl border p-5 shadow-sm transition-colors">
      <div className="flex items-start gap-3.5">
        {brand.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={brand.logo}
            alt=""
            className="size-11 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <div className="bg-muted text-foreground flex size-11 shrink-0 items-center justify-center rounded-xl text-base font-semibold">
            {brand.name.slice(0, 2)}
          </div>
        )}
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {brand.slug ? (
              <Link
                href={`/app/brands/${brand.slug}`}
                className="text-base font-semibold hover:underline"
              >
                {brand.name}
              </Link>
            ) : (
              <span className="text-base font-semibold">{brand.name}</span>
            )}
            <span className="border-border text-muted-foreground rounded-full border px-2 py-0.5 text-[11px] font-medium">
              {brand.type}
            </span>
            {brand.website && (
              <a
                href={brand.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                {brand.website.replace(/^https?:\/\//, "")}
              </a>
            )}
            {brand.slug && (
              <>
                <Link
                  href={`/app/brands/${brand.slug}`}
                  className="text-foreground text-xs hover:underline"
                >
                  Strategy ↗
                </Link>
                <Link
                  href={`/app/brands/${brand.slug}/ads`}
                  className="text-foreground text-xs hover:underline"
                >
                  Ads ↗
                </Link>
              </>
            )}
          </div>
          {brand.tagline && (
            <p className="text-muted-foreground mt-1 text-sm">
              {brand.tagline}
            </p>
          )}
          {summary.length > 0 && (
            <p className="text-muted-foreground mt-1 text-xs">
              {summary.join(" · ")}
            </p>
          )}
        </div>
        <BrandActions
          brand={{
            id: brand.id,
            name: brand.name,
            tagline: brand.tagline,
            description: brand.description,
            website: brand.website,
            logo: brand.logo,
          }}
        />
      </div>

      <BrandChannels
        brandId={brand.id}
        channels={channels}
        suggestions={suggestions}
        postCountByPlatform={postCountByPlatform}
        zernioProfileId={brand.zernioProfileId}
      />

      <BrandLinks brandId={brand.id} links={brand.links ?? []} />

      <BrandAudiences brandId={brand.id} brandName={brand.name} />

      <TrackedBrands ownerBrandId={brand.id} tracked={tracked} />
    </div>
  );
}

/**
 * Peer/reference brand card — read-only channel chips + handle discovery. Peer
 * brands can't be edited via channel.create (that's owned-only), so channels are
 * shown as plain chips; the only write path here is accepting a suggestion.
 */
function PeerBrandCard({
  brand,
  channels,
  trackedByLabel,
  suggestions,
  postCount,
  lastScraped,
  postCountByPlatform,
}: {
  brand: typeof brandTable.$inferSelect;
  channels: ChannelLite[];
  trackedByLabel: string;
  suggestions: SuggestionLite[];
  postCount: number;
  lastScraped: string | null;
  postCountByPlatform: Record<string, number>;
}) {
  const scrapeSummary =
    postCount > 0
      ? `${compactFmt.format(postCount)} scraped${
          lastScraped
            ? ` · last ${new Date(lastScraped).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}`
            : ""
        }`
      : null;
  return (
    <div
      id={`tracked-brand-${brand.id}`}
      className="bg-card scroll-mt-24 rounded-2xl border p-4 shadow-sm"
    >
      <div className="flex items-start gap-3.5">
        {brand.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={brand.logo}
            alt=""
            className="size-10 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <div className="bg-muted text-foreground flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold">
            {brand.name.slice(0, 2)}
          </div>
        )}
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-semibold">{brand.name}</span>
            {brand.website && (
              <a
                href={brand.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                {brand.website.replace(/^https?:\/\//, "")}
              </a>
            )}
            <span className="text-muted-foreground text-[11px]">
              {trackedByLabel}
            </span>
          </div>
          {brand.tagline && (
            <p className="text-muted-foreground mt-0.5 text-xs">
              {brand.tagline}
            </p>
          )}
          {scrapeSummary && (
            <p className="text-muted-foreground mt-1 text-xs">
              {scrapeSummary}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <SuggestedChannels
            brandId={brand.id}
            suggestions={suggestions}
            variant="action"
          />
          <PeerScrapeButton
            brandId={brand.id}
            channels={channels.map((c) => ({
              platform: c.platform,
              profileUrl: c.profileUrl,
            }))}
          />
        </div>
      </div>

      {channels.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {channels.map((c) => {
            const posts = postCountByPlatform[c.platform] ?? 0;
            return (
              <div
                key={c.id}
                className="flex items-center gap-2 rounded-lg border px-2 py-1.5"
              >
                <ChannelLogo platform={c.platform} />
                <span className="flex flex-col leading-tight">
                  <span className="text-xs font-medium">
                    {platformLabel(c.platform)}
                  </span>
                  {(c.handle || c.followerCount != null || posts > 0) && (
                    <span className="text-muted-foreground text-[11px]">
                      {c.handle}
                      {c.handle && c.followerCount != null && " · "}
                      {c.followerCount != null &&
                        `${new Intl.NumberFormat("en-US").format(c.followerCount)} followers`}
                      {posts > 0 &&
                        `${c.handle || c.followerCount != null ? " · " : ""}${posts} ${posts === 1 ? "post" : "posts"}`}
                    </span>
                  )}
                </span>
                {c.profileUrl && (
                  <a
                    href={c.profileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open page"
                    className="text-muted-foreground hover:text-foreground hover:bg-background ml-0.5 rounded p-1"
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}

      <SuggestedChannels
        brandId={brand.id}
        suggestions={suggestions}
        variant="results"
      />
    </div>
  );
}

export default async function BrandsPage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization;
  if (!org) {
    return (
      <div className="text-muted-foreground p-8">No organization found.</div>
    );
  }

  const brands = await db.query.brandTable.findMany({
    where: and(
      eq(brandTable.organizationId, org.id),
      isNull(brandTable.deletedAt),
    ),
    // Earliest-created first for a deterministic order; may switch to an explicit order column later.
    orderBy: (b, { asc }) => asc(b.createdAt),
  });
  const brandIds = brands.map((b) => b.id);

  const inspirations = brandIds.length
    ? await db.query.brandInspirationTable.findMany({
        where: inArray(brandInspirationTable.brandId, brandIds),
        with: { inspirationBrand: true, brand: true },
      })
    : [];

  // Peer/reference brands tracked by this org's owned brands.
  const peerBrandMap = new Map<string, typeof brandTable.$inferSelect>();
  for (const insp of inspirations) {
    if (insp.inspirationBrand)
      peerBrandMap.set(insp.inspirationBrand.id, insp.inspirationBrand);
  }
  const peerBrands = [...peerBrandMap.values()];

  // Channels + pending suggestions for owned AND peer brands.
  const allBrandIds = [...brandIds, ...peerBrands.map((b) => b.id)];
  const channels = allBrandIds.length
    ? await db.query.channelTable.findMany({
        where: inArray(channelTable.brandId, allBrandIds),
      })
    : [];
  const suggestionRows = allBrandIds.length
    ? await db.query.channelSuggestionTable.findMany({
        where: and(
          inArray(channelSuggestionTable.brandId, allBrandIds),
          eq(channelSuggestionTable.status, "pending"),
        ),
      })
    : [];

  // Audience-target counts per owned brand for the card summary line.
  const audienceTargets = brandIds.length
    ? await db.query.audienceTargetTable.findMany({
        where: and(
          inArray(audienceTargetTable.brandId, brandIds),
          isNull(audienceTargetTable.deletedAt),
        ),
        columns: { brandId: true },
      })
    : [];
  const audienceCountByBrand = new Map<string, number>();
  for (const t of audienceTargets) {
    audienceCountByBrand.set(
      t.brandId,
      (audienceCountByBrand.get(t.brandId) ?? 0) + 1,
    );
  }

  // Saved platform_post rollup per brand × platform (excl. seed demo rows).
  // Powers the brand-total summary AND the per-provider count on each channel
  // chip. Owned cards read it as corpus size; peer cards as scrape feedback.
  const postRollup = allBrandIds.length
    ? await db
        .select({
          brandId: platformPostTable.brandId,
          platform: platformPostTable.platform,
          posts: count(),
          lastScraped: max(platformPostTable.scrapedAt),
        })
        .from(platformPostTable)
        .where(
          and(
            inArray(platformPostTable.brandId, allBrandIds),
            eq(platformPostTable.isSeed, false),
          ),
        )
        .groupBy(platformPostTable.brandId, platformPostTable.platform)
    : [];
  const postCountByBrand = new Map<string, number>();
  const lastScrapedByBrand = new Map<string, Date>();
  // Per-platform: `${brandId}:${platform}` → count.
  const postCountByBrandPlatform = new Map<string, number>();
  for (const r of postRollup) {
    postCountByBrand.set(
      r.brandId,
      (postCountByBrand.get(r.brandId) ?? 0) + r.posts,
    );
    postCountByBrandPlatform.set(`${r.brandId}:${r.platform}`, r.posts);
    if (r.lastScraped) {
      const cur = lastScrapedByBrand.get(r.brandId);
      if (!cur || r.lastScraped > cur)
        lastScrapedByBrand.set(r.brandId, r.lastScraped);
    }
  }
  const postCountsForBrand = (brandId: string): Record<string, number> => {
    const out: Record<string, number> = {};
    const prefix = `${brandId}:`;
    for (const [k, v] of postCountByBrandPlatform) {
      if (k.startsWith(prefix)) out[k.slice(prefix.length)] = v;
    }
    return out;
  };

  const trackedByOwner = new Map<string, TrackedLite[]>();
  // For each peer brand, which owned brands track it + with what purpose.
  const peerTrackedBy = new Map<string, string[]>();
  for (const insp of inspirations) {
    if (!insp.inspirationBrand) continue;
    const list = trackedByOwner.get(insp.brandId) ?? [];
    list.push({
      inspirationId: insp.id,
      id: insp.inspirationBrand.id,
      name: insp.inspirationBrand.name,
      purpose: insp.purpose,
    });
    trackedByOwner.set(insp.brandId, list);

    const by = peerTrackedBy.get(insp.inspirationBrand.id) ?? [];
    by.push(`${insp.purpose} · ${insp.brand?.name ?? "?"}`);
    peerTrackedBy.set(insp.inspirationBrand.id, by);
  }
  const distinctTracked = peerBrands.length;

  const toLite = (c: typeof channelTable.$inferSelect): ChannelLite => ({
    id: c.id,
    kind: c.kind,
    platform: c.platform,
    handle: c.handle,
    profileImageUrl: c.profileImageUrl,
    connectionStatus: c.connectionStatus,
    profileUrl: c.profileUrl,
    manageUrl: c.manageUrl,
    followerCount: c.followerCount,
    followerHistory: c.followerHistory ?? [],
    defaultProvider: c.defaultProvider,
  });

  const toSuggestion = (
    s: typeof channelSuggestionTable.$inferSelect,
  ): SuggestionLite => ({
    id: s.id,
    platform: s.platform,
    handle: s.handle,
    profileUrl: s.profileUrl,
    confidence: s.confidence,
    verified: s.verified,
    followerCount: s.followerCount,
  });
  const suggestionsFor = (brandId: string) =>
    suggestionRows.filter((s) => s.brandId === brandId).map(toSuggestion);

  const renderBrand = (brand: typeof brandTable.$inferSelect) => (
    <BrandCard
      key={brand.id}
      brand={brand}
      channels={channels.filter((c) => c.brandId === brand.id).map(toLite)}
      tracked={trackedByOwner.get(brand.id) ?? []}
      suggestions={suggestionsFor(brand.id)}
      audienceCount={audienceCountByBrand.get(brand.id) ?? 0}
      postCount={postCountByBrand.get(brand.id) ?? 0}
      postCountByPlatform={postCountsForBrand(brand.id)}
    />
  );

  const company = brands.filter((b) => b.type === "company");
  const personal = brands.filter((b) => b.type === "personal");

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Brands</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {brands.length} owned · {distinctTracked} tracked
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ImportZernioBrands />
          <NewBrandButton />
        </div>
      </div>

      {brands.length === 0 && (
        <p className="text-muted-foreground mt-10 text-sm">
          No brands yet. Create your first one to get started.
        </p>
      )}

      {company.length > 0 && (
        <>
          <h2 className="text-muted-foreground mt-8 mb-3 text-xs font-semibold tracking-wider uppercase">
            Company brands
          </h2>
          <div className="flex flex-col gap-4">{company.map(renderBrand)}</div>
        </>
      )}

      {personal.length > 0 && (
        <>
          <h2 className="text-muted-foreground mt-10 mb-3 text-xs font-semibold tracking-wider uppercase">
            Personal brands
          </h2>
          <div className="flex flex-col gap-4">{personal.map(renderBrand)}</div>
        </>
      )}

      {peerBrands.length > 0 && (
        <>
          <h2 className="text-muted-foreground mt-10 mb-3 text-xs font-semibold tracking-wider uppercase">
            Tracked brands
          </h2>
          <div className="flex flex-col gap-4">
            {peerBrands.map((brand) => (
              <PeerBrandCard
                key={brand.id}
                brand={brand}
                channels={channels
                  .filter((c) => c.brandId === brand.id)
                  .map(toLite)}
                trackedByLabel={(peerTrackedBy.get(brand.id) ?? []).join(" · ")}
                suggestions={suggestionsFor(brand.id)}
                postCount={postCountByBrand.get(brand.id) ?? 0}
                lastScraped={
                  lastScrapedByBrand.get(brand.id)?.toISOString() ?? null
                }
                postCountByPlatform={postCountsForBrand(brand.id)}
              />
            ))}
          </div>
        </>
      )}

      <AmplifierRolodex />
    </div>
  );
}
