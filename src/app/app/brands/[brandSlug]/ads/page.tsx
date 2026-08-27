import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import {
  type AdSpot,
  adSpotTable,
  audienceTable,
  brandTable,
  type Campaign,
  campaignTable,
  channelTable,
  initiativeTable,
  memberTable,
} from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { CopyButton } from "@/components/copy-button";

import { NewCampaignButton } from "./NewCampaignButton";

const money = (n: number | null | undefined) =>
  n == null ? "—" : n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n}`;

const fmtDate = (d: Date) =>
  d.toLocaleDateString([], { month: "short", day: "numeric" });

const CAMPAIGN_STATUS: Record<string, string> = {
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

const INITIATIVE_STATUS: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-300",
  planned: "bg-sky-500/15 text-sky-300",
  paused: "bg-amber-500/15 text-amber-300",
  completed: "bg-muted text-muted-foreground",
  archived: "bg-muted text-muted-foreground",
};

/** One per-channel campaign + its ad-spot creatives. */
function CampaignRow({
  c,
  spots,
  brandSlug,
}: {
  c: Campaign;
  spots: AdSpot[];
  brandSlug: string;
}) {
  const thumbnail = c.heroThumbnailUrl ?? spots.find((s) => s.media?.[0]?.url)?.media?.[0]?.url;
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
              href={`/app/brands/${brandSlug}/ads/${c.id}`}
              className="truncate text-sm font-medium hover:underline"
            >
              {c.name}
            </Link>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
                CAMPAIGN_STATUS[c.status] ?? CAMPAIGN_STATUS.draft
              }`}
            >
              {c.status}
            </span>
          </div>
          <div className="text-muted-foreground mt-0.5 text-[11px]">
            {platformLabel(c.platform)} ·{" "}
            {c.startAt && c.endAt
              ? `${fmtDate(c.startAt)}–${fmtDate(c.endAt)}`
              : c.startAt
                ? `from ${fmtDate(c.startAt)}`
                : "—"}{" "}
            · {c.adSpots} spot{c.adSpots === 1 ? "" : "s"}
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
      {spots.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          {spots.map((s) => (
            <div
              key={s.id}
              className="bg-background w-28 shrink-0 overflow-hidden rounded-lg border"
            >
              <div className="bg-muted relative h-16">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.media?.[0]?.url ?? "/placeholder.svg"}
                  alt=""
                  className="h-full w-full object-cover"
                />
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
  const campaigns = await db.query.campaignTable.findMany({
    where: eq(campaignTable.brandId, brand.id),
  });
  const audiences = await db.query.audienceTable.findMany({
    where: eq(audienceTable.brandId, brand.id),
  });
  const initiatives = await db.query.initiativeTable.findMany({
    where: eq(initiativeTable.brandId, brand.id),
  });
  const adSpots = await db.query.adSpotTable.findMany({
    where: eq(adSpotTable.brandId, brand.id),
  });

  // Group campaigns under initiatives; track which campaigns have no parent.
  const campaignsByInitiative = new Map<string, typeof campaigns>();
  const ungroupedCampaigns: typeof campaigns = [];
  for (const c of campaigns) {
    if (c.initiativeId) {
      const list = campaignsByInitiative.get(c.initiativeId) ?? [];
      list.push(c);
      campaignsByInitiative.set(c.initiativeId, list);
    } else {
      ungroupedCampaigns.push(c);
    }
  }
  const spotsByCampaign = new Map<string, typeof adSpots>();
  for (const s of adSpots) {
    const list = spotsByCampaign.get(s.campaignId) ?? [];
    list.push(s);
    spotsByCampaign.set(s.campaignId, list);
  }
  const initiativeSpend = (initId: string) =>
    (campaignsByInitiative.get(initId) ?? []).reduce(
      (n, c) => n + (c.spend ?? 0),
      0,
    );
  const initiativeChannels = (initId: string) =>
    new Set<string>(
      (campaignsByInitiative.get(initId) ?? []).map((c) => c.platform),
    );

  const chanPlatform = new Map(channels.map((c) => [c.id, c.platform]));
  const totalSpend = campaigns.reduce((n, c) => n + (c.spend ?? 0), 0);
  const channelSpend = (id: string) =>
    campaigns
      .filter((c) => c.channelId === id)
      .reduce((n, c) => n + (c.spend ?? 0), 0);
  const channelCampaigns = (id: string) =>
    campaigns.filter((c) => c.channelId === id).length;

  // Dedupe audiences by name — the cross-channel view (one row, N platform badges).
  const audGroups = new Map<
    string,
    {
      name: string;
      type: string;
      sizeLabel: string | null;
      platforms: Set<string>;
    }
  >();
  for (const a of audiences) {
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
  const audienceList = [...audGroups.values()];

  // ---- markdown export for ChatGPT / Claude --------------------------------
  const md = [
    `# ${brand.name} — Ads context`,
    brand.tagline ? `\n${brand.tagline}` : "",
    brand.brandFingerprint?.fingerprintText
      ? `\n**Voice:** ${brand.brandFingerprint.fingerprintText}`
      : "",
    `\n## Initiatives (${initiatives.length})`,
    ...initiatives.map((init) => {
      const impl = initiativeChannels(init.id);
      const targets = init.targetChannels ?? [];
      const verify = targets
        .map(
          (ch) => `${platformLabel(ch)}${impl.has(ch) ? " ✓" : " ⚠ missing"}`,
        )
        .join(", ");
      return `- ${init.name} — goal: ${init.goal ?? "—"} · ${money(initiativeSpend(init.id))} of ${money(init.budget)} · channels: ${verify || "none"}`;
    }),
    `\n## Ad channels (${channels.length})`,
    ...channels.map(
      (c) =>
        `- ${platformLabel(c.platform)} (${c.handle ?? "—"}) — ${c.connectionStatus} · ${money(channelSpend(c.id))}/30d · ${channelCampaigns(c.id)} campaigns`,
    ),
    `\n## Campaigns (${campaigns.length})`,
    ...campaigns.map(
      (c) =>
        `- [${platformLabel(c.platform)}] ${c.name} — ${c.status}${
          c.startAt && c.endAt
            ? ` · ${fmtDate(c.startAt)}–${fmtDate(c.endAt)}`
            : ""
        } · spend ${money(c.spend)} of ${money(c.budget)} · ${c.adSpots} ad spots`,
    ),
    `\n## Audiences (${audienceList.length})`,
    ...audienceList.map(
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
            {initiatives.length} initiatives · {channels.length} ad channels ·{" "}
            {campaigns.length} campaigns · {audienceList.length} audiences ·{" "}
            {money(totalSpend)} / 30d
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CopyButton text={md} label="Copy for ChatGPT / Claude" />
          <NewCampaignButton brandId={brand.id} />
        </div>
      </div>

      {/* initiatives → per-channel campaigns */}
      <h2 className="text-muted-foreground mt-10 mb-3 text-xs font-semibold tracking-wider uppercase">
        Initiatives · {initiatives.length} · a push, verified across its
        channels
      </h2>
      <div className="flex flex-col gap-4">
        {initiatives.map((init) => {
          const initCampaigns = campaignsByInitiative.get(init.id) ?? [];
          const spend = initiativeSpend(init.id);
          const implemented = initiativeChannels(init.id);
          const targets = init.targetChannels ?? [];
          const pct = init.budget ? Math.min(1, spend / init.budget) : 0;
          const color = init.color ?? "#94a3b8";
          return (
            <div key={init.id} className="bg-card rounded-2xl border p-4">
              {/* initiative header */}
              <div className="flex items-start gap-3">
                <span
                  className="mt-1.5 size-2.5 shrink-0 rounded-full"
                  style={{ background: color }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold">{init.name}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
                        INITIATIVE_STATUS[init.status] ??
                        INITIATIVE_STATUS.planned
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

              {/* channel verify: target vs implemented */}
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="text-muted-foreground mr-1 text-[10px] tracking-wide uppercase">
                  Channels
                </span>
                {targets.length === 0 && (
                  <span className="text-muted-foreground text-[11px]">
                    none specified
                  </span>
                )}
                {targets.map((ch) => {
                  const ok = implemented.has(ch);
                  return (
                    <span
                      key={ch}
                      className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                        ok
                          ? "border-emerald-500/30 text-emerald-300"
                          : "border-amber-500/40 text-amber-300"
                      }`}
                    >
                      <ChannelLogo platform={ch} className="size-3.5" />
                      {platformLabel(ch)} {ok ? "✓" : "⚠ not set up"}
                    </span>
                  );
                })}
              </div>

              {/* nested per-channel campaigns */}
              <div className="mt-3 flex flex-col gap-2 border-t pt-3">
                {initCampaigns.length === 0 ? (
                  <p className="text-muted-foreground text-xs">
                    No campaigns implement this initiative yet.
                  </p>
                ) : (
                  initCampaigns.map((c) => (
                    <CampaignRow
                      key={c.id}
                      c={c}
                      spots={spotsByCampaign.get(c.id) ?? []}
                      brandSlug={brandSlug}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {ungroupedCampaigns.length > 0 && (
        <>
          <h3 className="text-muted-foreground mt-6 mb-2 text-xs font-semibold tracking-wider uppercase">
            Unlinked campaigns · {ungroupedCampaigns.length}
          </h3>
          <div className="flex flex-col gap-2">
            {ungroupedCampaigns.map((c) => (
              <CampaignRow
                key={c.id}
                c={c}
                spots={spotsByCampaign.get(c.id) ?? []}
                brandSlug={brandSlug}
              />
            ))}
          </div>
        </>
      )}

      {/* audiences */}
      <h2 className="text-muted-foreground mt-10 mb-3 text-xs font-semibold tracking-wider uppercase">
        Audiences · {audienceList.length} · defined per platform
      </h2>
      <div className="grid gap-2.5 md:grid-cols-2">
        {audienceList.map((a) => (
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

      <p className="text-muted-foreground mt-6 text-[11px]">
        Campaigns &amp; audiences are created and managed in each
        platform&apos;s portal — mirrored here read-only. The same audience on
        multiple platforms is shown once with all its badges.
      </p>
    </div>
  );
}
