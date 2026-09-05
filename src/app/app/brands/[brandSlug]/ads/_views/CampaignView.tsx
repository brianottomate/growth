import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { Check, Radio } from "lucide-react";

import { db } from "@/server/db";
import { memberTable, platformAdTable } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { campaignPrefillFromIntake } from "@/server/services/performance-intake.service";
import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/components/ui/lib/utils";
import { getDraftCampaign } from "@/server/services/ads-draft.service";

import { AddAdButton } from "./AddAdButton";
import { AskAssistantButton } from "./AskAssistantButton";
import { Audiences } from "./Audiences";
import { CreativePool } from "./CreativePool";
import { DeleteCampaignButton } from "./DeleteCampaignButton";
import { DraftedAds, type AdState } from "./DraftedAds";
import { DraftFromHomesButton } from "./DraftFromHomesButton";
import { money } from "./format";
import { PlanPlatformButton } from "./PlanPlatformButton";
import { PlatformSection } from "./PlatformSection";
import { WorkInChatButton } from "./WorkInChatButton";

/**
 * The campaign, read top to bottom as the work happens: photos, then the ads
 * made from them, who sees them, where they run, and what they are doing once
 * live. Each step shows its content when it has some and one clear way to
 * fill it when it does not, and each step can be handed to the assistant.
 *
 * Underneath it is still one plan compiled onto platforms: the platform rows
 * hold the authoritative budget while drafts, and the platform's own numbers
 * once pushed.
 */
export async function CampaignView({
  brandSlug,
  campaignId,
}: {
  brandSlug: string;
  campaignId: string;
}) {
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization;
  if (!org) notFound();

  const draft = await getDraftCampaign(org.id, campaignId).catch(() => null);
  if (draft?.brand.slug !== brandSlug) notFound();

  const { campaign, audiences, ads, platformCampaigns, personas } = draft;
  const brand = draft.brand;
  const brandName = brand.name;

  // Where this client's homes are, offered to the audience form as a starting
  // point. Only a paying client has an intake behind them; for Wander's own
  // brands this would be a query that can only answer "nothing".
  const prefill =
    brand.relationship === "client"
      ? await campaignPrefillFromIntake({ orgId: org.id }, { brandId: brand.id }).catch(
          () => null,
        )
      : null;

  const planned = [...platformCampaigns].sort((a, b) =>
    a.platform.localeCompare(b.platform),
  );
  const plannedPlatforms = planned.map((row) => row.platform);
  const pushed = planned.filter((row) => row.externalId);
  const anyPushed = pushed.length > 0;
  const anyLive = planned.some((row) => row.status === "live");

  // Where each ad stands, from the platform rows that point back at it.
  const states: Record<string, AdState> = {};
  if (pushed.length > 0) {
    const liveIds = new Set(pushed.filter((row) => row.status === "live").map((row) => row.id));
    const rows = await db.query.platformAdTable.findMany({
      where: and(
        inArray(platformAdTable.platformCampaignId, pushed.map((row) => row.id)),
        isNotNull(platformAdTable.adId),
      ),
      columns: { adId: true, platformCampaignId: true },
    });
    for (const row of rows) {
      if (!row.adId) continue;
      const state: AdState = liveIds.has(row.platformCampaignId) ? "live" : "pushed";
      if (states[row.adId] !== "live") states[row.adId] = state;
    }
  }

  const totals = planned.reduce(
    (acc, row) => {
      const stats = row.stats ?? {};
      acc.spend += stats.spend ?? row.spend ?? 0;
      acc.impressions += stats.impressions ?? 0;
      acc.clicks += stats.clicks ?? 0;
      return acc;
    },
    { spend: 0, impressions: 0, clicks: 0 },
  );
  const ctr =
    totals.impressions > 0
      ? `${((totals.clicks / totals.impressions) * 100).toFixed(2)}%`
      : "—";

  const pool = campaign.creativePool ?? [];
  const homesRun = campaign.homesRun ?? null;
  const ask = (focus: "photos" | "ads" | "audiences" | "platforms" | "live", text: string) => (
    <AskAssistantButton
      brandId={brand.id}
      brandName={brandName}
      campaignId={campaign.id}
      campaignName={campaign.name}
      focus={focus}
      ask={text}
      variant="ghost"
    />
  );

  // The first step without content is the one to do next.
  const filled = {
    photos: pool.length > 0,
    ads: ads.length > 0,
    audiences: audiences.length > 0,
    platforms: planned.length > 0,
    live: anyPushed,
  };
  const order = ["photos", "ads", "audiences", "platforms", "live"] as const;
  const next = order.find((key) => !filled[key]) ?? null;
  const stateOf = (key: (typeof order)[number]) =>
    filled[key] ? "done" : key === next ? "next" : "todo";

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 p-6">
      <header className="space-y-3">
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Link href="/app/brands" className="hover:underline">
            Brands
          </Link>
          <span>/</span>
          <Link href={`/app/brands/${brandSlug}`} className="hover:underline">
            {brandName}
          </Link>
          <span>/</span>
          <Link href={`/app/brands/${brandSlug}/ads`} className="hover:underline">
            Ads
          </Link>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h1 className="truncate text-xl font-semibold tracking-tight">{campaign.name}</h1>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-medium",
                  anyLive
                    ? "bg-emerald-500/15 text-emerald-300"
                    : anyPushed
                      ? "bg-sky-500/15 text-sky-300"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {anyLive ? "live" : anyPushed ? "pushed, paused" : "draft"}
              </span>
            </div>
            <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-sm">
              {plannedPlatforms.length === 0 ? (
                <span>No platform planned yet</span>
              ) : (
                plannedPlatforms.map((platform) => (
                  <span key={platform} className="flex items-center gap-1">
                    <ChannelLogo platform={platform} className="size-4" />
                    {platformLabel(platform)}
                  </span>
                ))
              )}
              {campaign.budget != null ? <span>· {money(campaign.budget)} planned</span> : null}
              {campaign.landingUrl ? (
                <span className="truncate">· {campaign.landingUrl}</span>
              ) : null}
            </p>
            {campaign.description ? (
              <p className="text-muted-foreground mt-2 max-w-2xl text-sm">{campaign.description}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <DeleteCampaignButton
              campaignId={campaign.id}
              campaignName={campaign.name}
              brandSlug={brandSlug}
              livePlatformCampaigns={pushed.length}
            />
            <WorkInChatButton
              brandId={brand.id}
              brandName={brandName}
              campaignId={campaign.id}
              campaignName={campaign.name}
              hasAds={ads.length > 0}
            />
          </div>
        </div>
      </header>

      <ol className="space-y-8">
        <Step
          n={1}
          state={stateOf("photos")}
          title="Photos"
          meta={pool.length > 0 ? `${pool.length} in the pool` : undefined}
          hint="Their listing heroes, library images, or cards from the Studio. Ads draw from these."
        >
          <CreativePool
            campaignId={campaign.id}
            brandId={brand.id}
            pool={pool}
            askAssistant={ask("photos", `Find photos for “${campaign.name}”`)}
          />
        </Step>

        <Step
          n={2}
          state={stateOf("ads")}
          title="Ads"
          meta={
            ads.length > 0
              ? [
                  `${ads.length} ad${ads.length === 1 ? "" : "s"}`,
                  Object.values(states).length > 0
                    ? `${Object.values(states).length} on a platform`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : undefined
          }
          hint="Each ad is a headline, a body and its cards. Every platform compiles these when you push."
          actions={
            ads.length > 0 ? (
              <>
                <DraftFromHomesButton
                  campaignId={campaign.id}
                  brandId={brand.id}
                  lastRun={homesRun}
                  label={homesRun ? "Homes run" : "From their homes"}
                />
                <AddAdButton
                  campaignId={campaign.id}
                  brandId={brand.id}
                  inheritedLinkUrl={campaign.landingUrl}
                />
              </>
            ) : null
          }
        >
          <DraftedAds
            ads={ads}
            states={states}
            brandId={brand.id}
            brandSlug={brandSlug}
            brandName={brandName}
            brandLogo={brand.logo}
            landingUrl={campaign.landingUrl}
            campaignId={campaign.id}
            homesRun={homesRun}
            emptyActions={
              <>
                <DraftFromHomesButton
                  campaignId={campaign.id}
                  brandId={brand.id}
                  lastRun={homesRun}
                  variant="default"
                />
                <AddAdButton
                  campaignId={campaign.id}
                  brandId={brand.id}
                  inheritedLinkUrl={campaign.landingUrl}
                />
                {ask("ads", `Draft the ads for “${campaign.name}”`)}
              </>
            }
          />
        </Step>

        <Step
          n={3}
          state={stateOf("audiences")}
          title="Audiences"
          meta={audiences.length > 0 ? `${audiences.length} ad set${audiences.length === 1 ? "" : "s"}` : "broad"}
          hint="Who sees the ads. Each row becomes an ad set on Meta, an ad group on Google."
        >
          <Audiences
            campaignId={campaign.id}
            audiences={audiences}
            personas={personas}
            geoPrefill={prefill?.geography ?? null}
            emptyActions={ask("audiences", `Suggest audiences for “${campaign.name}”`)}
          />
        </Step>

        <Step
          n={4}
          state={stateOf("platforms")}
          title="Platforms"
          meta={
            planned.length > 0
              ? planned.map((row) => platformLabel(row.platform)).join(", ")
              : undefined
          }
          hint="Where it runs. Each platform holds its own budget; the push compiles the plan there, paused."
          actions={
            planned.length > 0 ? (
              <PlanPlatformButton campaignId={campaign.id} planned={plannedPlatforms} />
            ) : null
          }
        >
          {planned.length === 0 ? (
            <EmptyState
              compact
              icon={Radio}
              title="No platform yet"
              description="Planning one creates its local draft with a budget and settings. Nothing reaches the platform until you push, and the push creates everything paused."
              actions={
                <>
                  <PlanPlatformButton campaignId={campaign.id} planned={plannedPlatforms} />
                  {ask("platforms", `Plan the platforms for “${campaign.name}”`)}
                </>
              }
            />
          ) : (
            <div className="space-y-2">
              {planned.map((platformCampaign) => (
                <PlatformSection
                  key={platformCampaign.id}
                  brandSlug={brandSlug}
                  campaignId={campaign.id}
                  platformCampaign={platformCampaign}
                  draftAdCount={ads.length}
                  audienceCount={audiences.length}
                  brandUrl={campaign.landingUrl ?? brand.website ?? null}
                />
              ))}
            </div>
          )}
        </Step>

        {anyPushed ? (
          <Step
            n={5}
            state="done"
            title="Live"
            meta={anyLive ? "spending" : "paused"}
            hint="What the platforms report. Delivery is switched per platform above."
            actions={ask("live", `How is “${campaign.name}” doing?`)}
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat
                label="Spend"
                value={money(totals.spend)}
                sub={campaign.budget != null ? `of ${money(campaign.budget)} planned` : undefined}
              />
              <Stat
                label="Impressions"
                value={totals.impressions ? totals.impressions.toLocaleString() : "—"}
              />
              <Stat label="Clicks" value={totals.clicks ? totals.clicks.toLocaleString() : "—"} />
              <Stat label="CTR" value={ctr} />
            </div>
          </Step>
        ) : null}
      </ol>
    </div>
  );
}

/**
 * One step of the sequence. The number shows where the operator is: filled
 * when the step has content, ringed when it is the next thing to do.
 */
function Step({
  n,
  state,
  title,
  meta,
  hint,
  actions,
  children,
}: {
  n: number;
  state: "done" | "next" | "todo";
  title: string;
  meta?: string;
  hint: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li className="grid gap-3 sm:grid-cols-[2rem_minmax(0,1fr)]">
      <div className="hidden sm:block">
        <span
          className={cn(
            "flex size-7 items-center justify-center rounded-full border text-xs font-semibold tabular-nums",
            state === "done" && "bg-foreground text-background border-foreground",
            state === "next" && "border-primary text-primary ring-primary/25 ring-4",
            state === "todo" && "text-muted-foreground",
          )}
          aria-label={
            state === "done" ? "Done" : state === "next" ? "Next step" : "Later"
          }
        >
          {state === "done" ? <Check className="size-3.5" /> : n}
        </span>
      </div>
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <span className="sm:hidden">{n}.</span>
              {title}
              {meta ? (
                <span className="text-muted-foreground text-sm font-normal">{meta}</span>
              ) : null}
            </h2>
            <p className="text-muted-foreground text-xs">{hint}</p>
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
        {children}
      </div>
    </li>
  );
}

/** One figure in the live strip. */
function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-card rounded-xl border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      {sub ? <p className="text-muted-foreground text-[11px]">{sub}</p> : null}
    </div>
  );
}
