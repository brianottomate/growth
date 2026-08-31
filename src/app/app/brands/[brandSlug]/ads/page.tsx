import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import {
  audienceTable,
  brandTable,
  personaTable,
  type PlatformAd,
  platformAdTable,
  platformAudienceTable,
  type PlatformCampaign,
  platformCampaignTable,
  channelTable,
  campaignTable,
  memberTable,
} from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { CopyButton } from "@/components/copy-button";

import { AttachCampaign } from "./AttachCampaign";
import { NewCampaignButton } from "./NewCampaignButton";

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

const money = (n: number | null | undefined) =>
  n == null ? "—" : n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n}`;

const fmtDate = (d: Date) =>
  d.toLocaleDateString([], { month: "short", day: "numeric" });

const PLATFORM_CAMPAIGN_STATUS: Record<string, string> = {
  live: "bg-emerald-500/15 text-emerald-300",
  scheduled: "bg-sky-500/15 text-sky-300",
  paused: "bg-amber-500/15 text-amber-300",
  ended: "bg-muted text-muted-foreground",
  draft: "bg-muted text-muted-foreground",
};

const AUDIENCE_LABEL: Record<string, string> = {
  segment: "Segment",
  keyword: "Keyword",
  intent: "Intent",
  lookalike: "Lookalike",
  custom: "Custom",
};

const AUDIENCE_VERDICT: Record<string, string> = {
  live: "border-emerald-500/30 text-emerald-300",
  planned: "border-border text-muted-foreground",
  missing: "border-amber-500/30 text-amber-300",
};

const AUDIENCE_PRIORITY: Record<string, string> = {
  must_have: "bg-red-500/15 text-red-300",
  should_have: "bg-sky-500/15 text-sky-300",
  nice_to_have: "bg-muted text-muted-foreground",
};

const CAMPAIGN_STATUS: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-300",
  planned: "bg-sky-500/15 text-sky-300",
  paused: "bg-amber-500/15 text-amber-300",
  completed: "bg-muted text-muted-foreground",
  archived: "bg-muted text-muted-foreground",
};

/**
 * An ad's creative image. First-party ads carry it in `media` (our R2 asset,
 * with a webp thumb); ads mirrored from the platform carry a platform URL on
 * `thumbnailUrl` and no media at all.
 */
const spotImage = (s: PlatformAd) =>
  s.media?.[0]?.thumbnail ?? s.media?.[0]?.url ?? s.thumbnailUrl ?? undefined;

/** One per-channel campaign + its ad-spot creatives. */
function CampaignRow({
  c,
  spots,
  brandSlug,
  attachBrandId,
}: {
  c: PlatformCampaign;
  spots: PlatformAd[];
  attachBrandId?: string;
  brandSlug: string;
}) {
  const thumbnail = c.heroThumbnailUrl ?? spots.map(spotImage).find(Boolean);
  return (
    <div className="bg-card flex flex-col gap-2 rounded-xl border p-3">
      <div className="flex items-center gap-3">
        {thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnail}
            alt=""
            className="size-12 shrink-0 rounded-lg border object-cover"
          />
        ) : (
          <ChannelLogo platform={c.platform} className="size-6" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link
              href={`/app/brands/${brandSlug}/ads/platform/${c.id}`}
              className="truncate text-sm font-medium hover:underline"
            >
              {c.name}
            </Link>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
                PLATFORM_CAMPAIGN_STATUS[c.status] ??
                PLATFORM_CAMPAIGN_STATUS.draft
              }`}
            >
              {platformLabel(c.platform)} · {c.status}
            </span>
          </div>
          <div className="text-muted-foreground mt-0.5 text-[11px]">
            {platformLabel(c.platform)} ·{" "}
            {c.startAt && c.endAt
              ? `${fmtDate(c.startAt)}–${fmtDate(c.endAt)}`
              : c.startAt
                ? `from ${fmtDate(c.startAt)}`
                : "—"}{" "}
            · {spots.length} ad{spots.length === 1 ? "" : "s"}
            {spots.length === 1 && spots[0]?.status
              ? ` · ${spots[0].status}`
              : ""}
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold tabular-nums">
            {c.spend ? money(c.spend) : "—"}
          </div>
          {c.budget != null && (
            <div className="text-muted-foreground text-[11px]">
              of {money(c.budget)}
            </div>
          )}
        </div>
        {c.manageUrl && (
          <a
            href={c.manageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:bg-accent ml-1 rounded-full border px-2.5 py-1 text-xs font-medium"
          >
            Open ↗
          </a>
        )}
      </div>
      {attachBrandId && (
        <AttachCampaign
          brandId={attachBrandId}
          platformCampaignId={c.id}
          suggestedName={c.name}
        />
      )}
      {/* The hero above is already this campaign's creative. A strip of one
          repeats it; a strip of several is the ad set, which is worth seeing. */}
      {spots.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {spots.map((s) => (
            <div
              key={s.id}
              className="bg-background w-28 shrink-0 overflow-hidden rounded-lg border"
            >
              <div className="bg-muted relative grid h-16 place-items-center">
                {/* Ads we authored carry their creative in `media`; ads mirrored
                    from the platform carry it on `thumbnailUrl` instead. */}
                {spotImage(s) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={spotImage(s)}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <ChannelLogo
                    platform={c.platform}
                    className="size-4 opacity-40"
                  />
                )}
                {s.status && (
                  <span className="absolute top-1 right-1 rounded-full bg-black/40 px-1.5 py-0.5 text-[8px] font-medium text-white capitalize backdrop-blur-sm">
                    {s.status}
                  </span>
                )}
              </div>
              <div className="p-1.5">
                {s.body && (
                  <p className="line-clamp-2 text-[10px] leading-snug">
                    {s.body}
                  </p>
                )}
                {s.stats?.spend != null && (
                  <div className="text-muted-foreground mt-0.5 text-[9px] tabular-nums">
                    {money(s.stats.spend)}
                    {s.stats.ctr != null ? ` · ${s.stats.ctr}% CTR` : ""}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default async function BrandAdsPage({
  params,
}: {
  params: Promise<{ brandSlug: string }>;
}) {
  const { brandSlug } = await params;
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization;
  if (!org) notFound();
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.slug, brandSlug),
      eq(brandTable.organizationId, org.id),
      isNull(brandTable.deletedAt),
    ),
  });
  if (!brand) notFound();

  const channels = await db.query.channelTable.findMany({
    where: and(eq(channelTable.brandId, brand.id), eq(channelTable.kind, "ad")),
  });
  const platformCampaigns = await db.query.platformCampaignTable.findMany({
    where: eq(platformCampaignTable.brandId, brand.id),
  });
  const campaigns = await db.query.campaignTable.findMany({
    where: eq(campaignTable.brandId, brand.id),
  });
  const [planAudiences, personas, platformAudiences, platformAds] =
    await Promise.all([
      db.query.audienceTable.findMany({
        where: eq(audienceTable.brandId, brand.id),
      }),
      db.query.personaTable.findMany({
        where: and(
          eq(personaTable.brandId, brand.id),
          isNull(personaTable.deletedAt),
        ),
      }),
      db.query.platformAudienceTable.findMany({
        where: eq(platformAudienceTable.brandId, brand.id),
      }),
      db.query.platformAdTable.findMany({
        where: eq(platformAdTable.brandId, brand.id),
      }),
    ]);

  // Group platform campaigns under their campaign; track the orphans.
  const platformByCampaign = new Map<string, typeof platformCampaigns>();
  const ungroupedPlatformCampaigns: typeof platformCampaigns = [];
  for (const c of platformCampaigns) {
    if (c.campaignId) {
      const list = platformByCampaign.get(c.campaignId) ?? [];
      list.push(c);
      platformByCampaign.set(c.campaignId, list);
    } else {
      ungroupedPlatformCampaigns.push(c);
    }
  }
  // Drafted ads have no campaign until the push creates one; they show on
  // the draft page, not here.
  const spotsByPlatformCampaign = new Map<string, typeof platformAds>();
  for (const s of platformAds) {
    const list = spotsByPlatformCampaign.get(s.platformCampaignId) ?? [];
    list.push(s);
    spotsByPlatformCampaign.set(s.platformCampaignId, list);
  }
  const campaignSpend = (campaignId: string) =>
    (platformByCampaign.get(campaignId) ?? []).reduce(
      (n, c) => n + (c.spend ?? 0),
      0,
    );

  const chanPlatform = new Map(channels.map((c) => [c.id, c.platform]));
  const totalSpend = platformCampaigns.reduce((n, c) => n + (c.spend ?? 0), 0);
  const channelSpend = (id: string) =>
    platformCampaigns
      .filter((c) => c.channelId === id)
      .reduce((n, c) => n + (c.spend ?? 0), 0);
  const channelCampaigns = (id: string) =>
    platformCampaigns.filter((c) => c.channelId === id).length;

  // Mirrored platform audiences with no target are the audience floaters —
  // the same shape as a platform campaign that is not in a campaign yet.
  // Deduped by name, so one row carries N platform badges.
  const audGroups = new Map<
    string,
    {
      name: string;
      type: string;
      sizeLabel: string | null;
      platforms: Set<string>;
    }
  >();
  for (const a of platformAudiences) {
    if (a.audienceId) continue;
    const g = audGroups.get(a.name) ?? {
      name: a.name,
      type: a.type,
      sizeLabel: a.sizeLabel,
      platforms: new Set<string>(),
    };
    const plat = chanPlatform.get(a.channelId);
    if (plat) g.platforms.add(plat);
    audGroups.set(a.name, g);
  }
  const unmappedAudiences = [...audGroups.values()];

  // ---- markdown export for ChatGPT / Claude --------------------------------
  const md = [
    `# ${brand.name} — Ads context`,
    brand.tagline ? `\n${brand.tagline}` : "",
    brand.brandFingerprint?.fingerprintText
      ? `\n**Voice:** ${brand.brandFingerprint.fingerprintText}`
      : "",
    `\n## Campaigns (${campaigns.length})`,
    ...campaigns.map((init) => {
      const rows = platformByCampaign.get(init.id) ?? [];
      const verify = rows
        .map(
          (row) =>
            `${platformLabel(row.platform)}${row.externalId ? " ✓" : " · planned"}`,
        )
        .join(", ");
      return `- ${init.name} · goal: ${init.goal ?? "—"} · ${money(campaignSpend(init.id))} of ${money(init.budget)} · platforms: ${verify || "none"}`;
    }),
    `\n## Ad channels (${channels.length})`,
    ...channels.map(
      (c) =>
        `- ${platformLabel(c.platform)} (${c.handle ?? "—"}) — ${c.connectionStatus} · ${money(channelSpend(c.id))}/30d · ${channelCampaigns(c.id)} campaigns`,
    ),
    `\n## Platform campaigns (${platformCampaigns.length})`,
    ...platformCampaigns.map(
      (c) =>
        `- [${platformLabel(c.platform)}] ${c.name} — ${c.status}${
          c.startAt && c.endAt
            ? ` · ${fmtDate(c.startAt)}–${fmtDate(c.endAt)}`
            : ""
        } · spend ${money(c.spend)} of ${money(c.budget)} · ${c.adCount} ads`,
    ),
    `\n## Personas (${personas.length})`,
    ...personas.map(
      (persona) =>
        `- ${persona.name}${persona.ageRanges?.length ? ` · ${persona.ageRanges.join(", ")}` : ""}${persona.geographies?.length ? ` · ${persona.geographies.join(", ")}` : ""}`,
    ),
    `\n## Campaign audiences (${planAudiences.length})`,
    ...planAudiences.map((aud) => {
      const campaignName =
        campaigns.find((row) => row.id === aud.campaignId)?.name ?? "?";
      return `- ${aud.name} (in ${campaignName})${aud.ageMin != null || aud.ageMax != null ? ` · ${aud.ageMin ?? "13"}-${aud.ageMax ?? "65+"}` : ""}${aud.geography?.regions?.length ? ` · ${aud.geography.regions.join(", ")}` : ""}`;
    }),
    unmappedAudiences.length
      ? `\n## Platform audiences not mapped to one of the above (${unmappedAudiences.length})`
      : "",
    ...unmappedAudiences.map(
      (a) =>
        `- ${a.name} (${AUDIENCE_LABEL[a.type] ?? a.type}) — ${a.sizeLabel ?? "—"} · on ${[...a.platforms].map(platformLabel).join(", ")}`,
    ),
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div>
      {/* header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Link href="/app/brands" className="hover:text-foreground">
              Brands
            </Link>
            <span>/</span>
            <span className="text-foreground font-medium">{brand.name}</span>
            <span>/</span>
            <span className="text-foreground font-medium">ads</span>
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">
            {brand.name} · Ads
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Ad channels, campaigns &amp; audiences — a launchpad. Management
            happens in each platform&apos;s portal.
          </p>
          <p className="text-muted-foreground mt-2 text-xs">
            {plural(campaigns.length, "campaign")} ·{" "}
            {plural(channels.length, "ad channel")} ·{" "}
            {plural(platformCampaigns.length, "platform campaign")} ·{" "}
            {plural(personas.length, "persona")} · {money(totalSpend)} / 30d
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CopyButton text={md} label="Copy for ChatGPT / Claude" />
          <NewCampaignButton brandId={brand.id} brandWebsite={brand.website} />
        </div>
      </div>

      {/* campaigns → per-channel campaigns */}
      <h2 className="text-muted-foreground mt-10 mb-3 text-xs font-semibold tracking-wider uppercase">
        Campaigns · {campaigns.length} · one push, verified across its channels
      </h2>
      <div className="flex flex-col gap-4">
        {campaigns.map((init) => {
          const initCampaigns = platformByCampaign.get(init.id) ?? [];
          const spend = campaignSpend(init.id);
          const pct = init.budget ? Math.min(1, spend / init.budget) : 0;
          const color = init.color ?? "#94a3b8";
          // A campaign looks like its creative before it looks like anything
          // else. Prefer what it will actually run with — its ads — and fall
          // back to the shared pool it was drafted from.
          const hero =
            initCampaigns
              .flatMap((row) => spotsByPlatformCampaign.get(row.id) ?? [])
              .map(spotImage)
              .find(Boolean) ??
            initCampaigns.map((row) => row.heroThumbnailUrl).find(Boolean) ??
            init.creativePool?.[0]?.url;
          return (
            <div key={init.id} className="bg-card rounded-2xl border p-4">
              {/* campaign header */}
              <div className="flex items-start gap-3">
                {hero ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={hero}
                    alt=""
                    className="size-10 shrink-0 rounded-lg border object-cover"
                  />
                ) : (
                  <span
                    className="mt-1.5 size-2.5 shrink-0 rounded-full"
                    style={{ background: color }}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/app/brands/${brandSlug}/ads/${init.id}`}
                      className="text-base font-semibold hover:underline"
                    >
                      {init.name}
                    </Link>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
                        CAMPAIGN_STATUS[init.status] ?? CAMPAIGN_STATUS.planned
                      }`}
                    >
                      {init.status}
                    </span>
                  </div>
                  <div className="text-muted-foreground mt-0.5 text-xs">
                    {init.goal ? (
                      <span className="capitalize">{init.goal}</span>
                    ) : (
                      "—"
                    )}
                    {init.landingUrl
                      ? ` · ${init.landingUrl.replace(/^https?:\/\//, "")}`
                      : ""}
                  </div>
                </div>
                <div className="w-40 text-right">
                  <div className="text-sm font-semibold tabular-nums">
                    {money(spend)}{" "}
                    <span className="text-muted-foreground font-normal">
                      / {money(init.budget)}
                    </span>
                  </div>
                  <div className="bg-muted mt-1 h-1.5 overflow-hidden rounded-full">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct * 100}%`, background: color }}
                    />
                  </div>
                </div>
              </div>

              {/* platforms: planned drafts vs pushed reality */}
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="text-muted-foreground mr-1 text-[10px] tracking-wide uppercase">
                  Platforms
                </span>
                {initCampaigns.length === 0 && (
                  <span className="text-muted-foreground text-[11px]">
                    none planned
                  </span>
                )}
                {initCampaigns.map((row) => {
                  const ok = Boolean(row.externalId);
                  return (
                    <span
                      key={row.id}
                      className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                        ok && row.status === "live"
                          ? "border-emerald-500/30 text-emerald-300"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      <ChannelLogo
                        platform={row.platform}
                        className="size-3.5"
                      />
                      {platformLabel(row.platform)}{" "}
                      {row.status === "live"
                        ? "✓ live"
                        : ok
                          ? `· ${row.status}`
                          : "· planned"}
                    </span>
                  );
                })}
              </div>

              {/* nested per-channel campaigns */}
              <div className="mt-3 flex flex-col gap-2 border-t pt-3">
                {initCampaigns.length === 0 ? (
                  <p className="text-muted-foreground text-xs">
                    Not on any platform yet.
                  </p>
                ) : (
                  initCampaigns.map((c) => (
                    <CampaignRow
                      key={c.id}
                      c={c}
                      spots={spotsByPlatformCampaign.get(c.id) ?? []}
                      brandSlug={brandSlug}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {ungroupedPlatformCampaigns.length > 0 && (
        <>
          <h3 className="text-muted-foreground mt-6 mb-1 text-xs font-semibold tracking-wider uppercase">
            Not in a campaign yet · {ungroupedPlatformCampaigns.length}
          </h3>
          <p className="text-muted-foreground mb-2 text-xs">
            Pulled from the ad account. They are fine unattached; attaching one
            just groups its spend under a campaign you author.
          </p>
          <div className="flex flex-col gap-2">
            {ungroupedPlatformCampaigns.map((c) => (
              <CampaignRow
                key={c.id}
                c={c}
                spots={spotsByPlatformCampaign.get(c.id) ?? []}
                brandSlug={brandSlug}
                attachBrandId={brand.id}
              />
            ))}
          </div>
        </>
      )}

      {/* personas */}
      <h2 className="text-muted-foreground mt-10 mb-1 text-xs font-semibold tracking-wider uppercase">
        Personas · {personas.length} · who {brand.name} talks to
      </h2>
      <p className="text-muted-foreground mb-3 text-xs">
        The stable brand-level layer. A campaign narrows a persona into a
        buyable audience — age window, geography, budget — on its own page.
      </p>
      {personas.length === 0 ? (
        <div className="bg-card rounded-xl border p-6 text-center">
          <p className="text-sm font-medium">No personas yet</p>
          <p className="text-muted-foreground mx-auto mt-1 max-w-md text-xs">
            A persona is the durable &ldquo;who&rdquo; — &ldquo;first-time
            homebuyers&rdquo; — that inspires campaign audiences and content
            alike. Few and stable, like pillars.
          </p>
          <Link
            href="/app/audiences"
            className="bg-primary text-primary-foreground mt-4 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium hover:opacity-90"
          >
            Define personas
          </Link>
        </div>
      ) : (
        <div className="grid gap-2.5 md:grid-cols-2">
          {personas.map((persona) => {
            const derived = planAudiences.filter(
              (aud) => aud.personaId === persona.id,
            );
            return (
              <div key={persona.id} className="bg-card rounded-xl border p-3.5">
                <div className="text-sm font-medium">{persona.name}</div>
                <div className="text-muted-foreground mt-0.5 text-[11px]">
                  {[
                    persona.ageRanges?.join(", "),
                    persona.geographies?.join(", "),
                  ]
                    .filter(Boolean)
                    .join(" · ") || "No planning metadata yet"}
                </div>
                <div className="text-muted-foreground mt-2 text-[11px]">
                  {derived.length > 0
                    ? `${plural(derived.length, "campaign audience")} derived from this`
                    : "No campaign audience derived yet"}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {unmappedAudiences.length > 0 && (
        <>
          <h3 className="text-muted-foreground mt-6 mb-1 text-xs font-semibold tracking-wider uppercase">
            In an ad account, not mapped yet · {unmappedAudiences.length}
          </h3>
          <p className="text-muted-foreground mb-2 text-xs">
            Mirrored from the platform. They target fine as they are; mapping
            one to an audience is what makes it count as coverage above.
          </p>
          <div className="grid gap-2.5 md:grid-cols-2">
            {unmappedAudiences.map((a) => (
              <div
                key={a.name}
                className="bg-card flex items-start justify-between rounded-xl border p-3.5"
              >
                <div>
                  <div className="text-sm font-medium">{a.name}</div>
                  <div className="text-muted-foreground mt-1 flex items-center gap-2 text-[11px]">
                    <span className="tabular-nums">{a.sizeLabel ?? "—"}</span>
                    <span>·</span>
                    <div className="flex items-center gap-1.5">
                      {[...a.platforms].map((p) => (
                        <span key={p} className="flex items-center gap-1">
                          <ChannelLogo platform={p} className="size-3.5" />
                          {platformLabel(p)}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <span className="border-border text-muted-foreground rounded-full border px-2 py-0.5 text-[11px] font-medium">
                  {AUDIENCE_LABEL[a.type] ?? a.type}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="text-muted-foreground mt-6 text-[11px]">
        Campaigns are created and managed in each platform&apos;s portal, then
        mirrored here read-only. Audiences are authored here and activated per
        platform; the same one on multiple platforms is shown once with all its
        badges.
      </p>
    </div>
  );
}
