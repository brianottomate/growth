import { redirect } from "next/navigation";
import { ExternalLink } from "lucide-react";
import {
  and,
  count,
  eq,
  inArray,
  isNotNull,
  isNull,
  max,
  sql,
} from "drizzle-orm";

import { db } from "@/server/db";
import {
  personaTable,
  brandInspirationTable,
  brandTable,
  channelSuggestionTable,
  channelTable,
  mediaAssetTable,
  memberTable,
  platformAdTable,
  performanceAccountTable,
  performanceCycleTable,
  performanceIntakeTable,
  performancePropertyTable,
  platformPostTable,
} from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { listBrandPillars } from "@/server/services/content-strategy.service";
import type { ChannelLite } from "./BrandChannels";
import {
  BrandCard,
  type BrandReadiness,
  type MediaLite,
  type PersonaLite,
  type PillarLite,
} from "./BrandCard";
import { NewBrandButton } from "./NewBrandButton";
import { ImportZernioBrands } from "./ImportZernioBrands";
import type { TrackedLite } from "./TrackedBrands";
import { SuggestedChannels, type SuggestionLite } from "./SuggestedChannels";
import { PeerScrapeButton } from "./PeerScrapeButton";
import { AmplifierRolodex } from "./AmplifierRolodex";
import { BrandSearch } from "./BrandSearch";
import { ChannelLogo, platformLabel } from "@/components/channel-logos";

const compactFmt = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

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
      className="scroll-mt-24 rounded-2xl border bg-card p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-start gap-3.5">
        {brand.logo ? (
          // oxlint-disable-next-line nextjs/no-img-element
          <img
            src={brand.logo}
            alt=""
            className="size-10 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-sm font-semibold text-foreground">
            {brand.name.slice(0, 2)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-semibold">{brand.name}</span>
            {brand.website && (
              <a
                href={brand.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {brand.website.replace(/^https?:\/\//, "")}
              </a>
            )}
            <span className="text-[11px] text-muted-foreground">
              {trackedByLabel}
            </span>
          </div>
          {brand.tagline && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {brand.tagline}
            </p>
          )}
          {scrapeSummary && (
            <p className="mt-1 text-xs text-muted-foreground">
              {scrapeSummary}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1">
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
                    <span className="text-[11px] text-muted-foreground">
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
                    className="ml-0.5 rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
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
      <div className="p-8 text-muted-foreground">No organization found.</div>
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

  // Performance readiness. Only brands with a commercial record get a strip,
  // so this is a handful of rows however many brands the org has.
  const perfAccounts = brandIds.length
    ? await db.query.performanceAccountTable.findMany({
        where: and(
          inArray(performanceAccountTable.brandId, brandIds),
          isNull(performanceAccountTable.deletedAt),
        ),
        columns: { id: true, brandId: true },
      })
    : [];
  const perfAccountIds = perfAccounts.map((row) => row.id);
  const [perfIntakes, perfProperties, perfCycles] = perfAccountIds.length
    ? await Promise.all([
        db.query.performanceIntakeTable.findMany({
          where: inArray(performanceIntakeTable.accountId, perfAccountIds),
          orderBy: (t, { desc }) => desc(t.submittedAt),
          columns: {
            accountId: true,
            answers: true,
            zernioVerifiedAt: true,
            verifiedPageId: true,
            verifiedAdAccountId: true,
            mediaBudgetDollars: true,
          },
        }),
        db.query.performancePropertyTable.findMany({
          where: and(
            inArray(performancePropertyTable.accountId, perfAccountIds),
            isNull(performancePropertyTable.deletedAt),
          ),
          columns: { accountId: true },
        }),
        db.query.performanceCycleTable.findMany({
          where: inArray(performanceCycleTable.accountId, perfAccountIds),
          columns: { accountId: true, mediaBudget: true },
          orderBy: (t, { desc }) => desc(t.period),
        }),
      ])
    : [[], [], []];

  const readinessByBrand = new Map<string, BrandReadiness>();
  for (const account of perfAccounts) {
    if (!account.brandId) continue;
    // Ordered newest-first above, so the first hit is the latest.
    const intake = perfIntakes.find((row) => row.accountId === account.id);
    const cycle = perfCycles.find((row) => row.accountId === account.id);
    readinessByBrand.set(account.brandId, {
      accountId: account.id,
      intake: intake != null,
      access: intake?.zernioVerifiedAt != null,
      page: intake?.verifiedPageId != null,
      adAccount: intake?.verifiedAdAccountId != null,
      homes: perfProperties.filter((row) => row.accountId === account.id)
        .length,
      budget: cycle?.mediaBudget ?? intake?.mediaBudgetDollars ?? null,
      creative: Boolean(intake?.answers?.creativeDriveUrl),
    });
  }

  // Strategy band: pillars (defaults + custom rows) with post counts, and the
  // first persona per brand. Both read the same tables the detail page uses.
  const pillarLists = await Promise.all(
    brands.map((b) => listBrandPillars({ brandId: b.id, brandSlug: b.slug })),
  );
  const pillarPostRollup = brandIds.length
    ? await db
        .select({
          brandId: platformPostTable.brandId,
          pillar: platformPostTable.pillar,
          posts: count(),
        })
        .from(platformPostTable)
        .where(
          and(
            inArray(platformPostTable.brandId, brandIds),
            eq(platformPostTable.isSeed, false),
            isNotNull(platformPostTable.pillar),
          ),
        )
        .groupBy(platformPostTable.brandId, platformPostTable.pillar)
    : [];
  const pillarsByBrand = new Map<string, PillarLite[]>();
  brands.forEach((b, i) => {
    pillarsByBrand.set(
      b.id,
      (pillarLists[i] ?? []).map((p) => ({
        slug: p.slug,
        name: p.name,
        color: p.color,
        posts:
          pillarPostRollup.find(
            (r) => r.brandId === b.id && r.pillar === p.slug,
          )?.posts ?? 0,
      })),
    );
  });

  const personas = brandIds.length
    ? await db.query.personaTable.findMany({
        where: and(
          inArray(personaTable.brandId, brandIds),
          isNull(personaTable.deletedAt),
        ),
        orderBy: (t, { asc }) => asc(t.createdAt),
        columns: {
          brandId: true,
          name: true,
          description: true,
          ageRanges: true,
        },
      })
    : [];
  const personaByBrand = new Map<string, PersonaLite>();
  for (const p of personas) {
    const existing = personaByBrand.get(p.brandId);
    if (existing) existing.count += 1;
    else
      personaByBrand.set(p.brandId, {
        name: p.name,
        description: p.description,
        ageRanges: p.ageRanges ?? null,
        count: 1,
      });
  }

  // Media zone: library size, the six newest usable assets, and which of them
  // are in a live ad right now. Ranked in SQL so one large library cannot
  // crowd out the others.
  const usableMedia = and(
    inArray(mediaAssetTable.brandId, brandIds),
    isNull(mediaAssetTable.deletedAt),
    eq(mediaAssetTable.status, "ready"),
    eq(mediaAssetTable.reviewStatus, "approved"),
    inArray(mediaAssetTable.kind, ["image", "video"]),
  );
  const rankedMedia = db
    .select({
      id: mediaAssetTable.id,
      brandId: mediaAssetTable.brandId,
      url: mediaAssetTable.url,
      thumbnailUrl: mediaAssetTable.thumbnailUrl,
      kind: mediaAssetTable.kind,
      rn: sql<number>`row_number() over (partition by ${mediaAssetTable.brandId} order by ${mediaAssetTable.createdAt} desc)`.as(
        "rn",
      ),
    })
    .from(mediaAssetTable)
    .where(usableMedia)
    .as("ranked_media");
  const [mediaCounts, mediaThumbs, adRows] = brandIds.length
    ? await Promise.all([
        db
          .select({ brandId: mediaAssetTable.brandId, total: count() })
          .from(mediaAssetTable)
          .where(usableMedia)
          .groupBy(mediaAssetTable.brandId),
        db
          .select()
          .from(rankedMedia)
          .where(sql`${rankedMedia.rn} <= 6`),
        db
          .select({
            brandId: platformAdTable.brandId,
            status: platformAdTable.status,
            media: platformAdTable.media,
            thumbnailUrl: platformAdTable.thumbnailUrl,
          })
          .from(platformAdTable)
          .where(inArray(platformAdTable.brandId, brandIds)),
      ])
    : [[], [], []];
  const liveAdsByBrand = new Map<
    string,
    { count: number; urls: Set<string> }
  >();
  for (const ad of adRows) {
    if (!ad.brandId || ad.status?.toLowerCase() !== "active") continue;
    const entry = liveAdsByBrand.get(ad.brandId) ?? {
      count: 0,
      urls: new Set(),
    };
    entry.count += 1;
    for (const m of ad.media ?? []) {
      entry.urls.add(m.url);
      if (m.thumbnail) entry.urls.add(m.thumbnail);
    }
    if (ad.thumbnailUrl) entry.urls.add(ad.thumbnailUrl);
    liveAdsByBrand.set(ad.brandId, entry);
  }
  const mediaFor = (brandId: string): MediaLite => {
    const live = liveAdsByBrand.get(brandId);
    return {
      total: mediaCounts.find((m) => m.brandId === brandId)?.total ?? 0,
      liveAds: live?.count ?? 0,
      thumbs: mediaThumbs
        .filter((m) => m.brandId === brandId)
        .sort((a, b) => a.rn - b.rn)
        .flatMap((m) => {
          const src = m.kind === "image" ? m.url : m.thumbnailUrl;
          if (!src) return [];
          return [
            {
              id: m.id,
              src,
              kind: m.kind,
              inLiveAd:
                !!live &&
                ((m.url != null && live.urls.has(m.url)) || live.urls.has(src)),
            },
          ];
        }),
    };
  };

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
      postCountByPlatform={postCountsForBrand(brand.id)}
      readiness={readinessByBrand.get(brand.id) ?? null}
      pillars={pillarsByBrand.get(brand.id) ?? []}
      persona={personaByBrand.get(brand.id) ?? null}
      media={mediaFor(brand.id)}
    />
  );

  const renderPeerBrand = (brand: typeof brandTable.$inferSelect) => (
    <PeerBrandCard
      key={brand.id}
      brand={brand}
      channels={channels.filter((c) => c.brandId === brand.id).map(toLite)}
      trackedByLabel={(peerTrackedBy.get(brand.id) ?? []).join(" · ")}
      suggestions={suggestionsFor(brand.id)}
      postCount={postCountByBrand.get(brand.id) ?? 0}
      lastScraped={lastScrapedByBrand.get(brand.id)?.toISOString() ?? null}
      postCountByPlatform={postCountsForBrand(brand.id)}
    />
  );

  // What a teammate would type to find a brand: its name, the URL they know it
  // by, or a handle they saw on a post.
  const searchKey = (brand: typeof brandTable.$inferSelect) =>
    [
      brand.name,
      brand.slug,
      brand.website,
      brand.tagline,
      ...channels
        .filter((c) => c.brandId === brand.id)
        .flatMap((c) => [c.handle, c.platform]),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

  // Relationship decides the group, and the brand's own type stays the badge
  // on its card. A client that is also a company brand belongs in one list, so
  // relationship is checked first and the type split only covers our own.
  const clients = brands.filter((b) => b.relationship === "client");
  const prospects = brands.filter((b) => b.relationship === "prospect");
  const ours = brands.filter(
    (b) => b.relationship !== "client" && b.relationship !== "prospect",
  );

  const searchGroups = [
    { label: "Clients", brands: clients, render: renderBrand },
    {
      label: "Prospects",
      brands: prospects,
      render: renderBrand,
      defaultHidden: true,
    },
    {
      label: "Company brands",
      brands: ours.filter((b) => b.type === "company"),
      render: renderBrand,
    },
    {
      label: "Personal brands",
      brands: ours.filter((b) => b.type === "personal"),
      render: renderBrand,
    },
    { label: "Tracked brands", brands: peerBrands, render: renderPeerBrand },
  ]
    .filter((group) => group.brands.length > 0)
    .map((group) => ({
      label: group.label,
      defaultHidden: group.defaultHidden,
      entries: group.brands.map((brand) => ({
        key: brand.id,
        search: searchKey(brand),
        node: group.render(brand),
      })),
    }));

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Brands</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {clients.length} client{clients.length === 1 ? "" : "s"} ·{" "}
            {prospects.length} prospect{prospects.length === 1 ? "" : "s"} ·{" "}
            {ours.length} ours · {distinctTracked} tracked
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ImportZernioBrands />
          <NewBrandButton />
        </div>
      </div>

      {brands.length === 0 && (
        <p className="mt-10 text-sm text-muted-foreground">
          No brands yet. Create your first one to get started.
        </p>
      )}

      {searchGroups.length > 0 && <BrandSearch groups={searchGroups} />}

      <AmplifierRolodex />
    </div>
  );
}
