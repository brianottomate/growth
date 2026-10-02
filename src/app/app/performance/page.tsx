import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowRight, Crosshair } from "lucide-react";

import { db } from "@/server/db";
import { memberTable } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/components/ui/lib/utils";
import {
  deskMoney,
  loadPerformanceDesk,
  narrowDesk,
  type DeskBrand,
  type DeskCampaign,
} from "@/server/services/performance-desk.service";
import { loadPerformanceTracker } from "@/server/services/performance-tracker.service";

import {
  brandAdsHref,
  BrandLogo,
  CampaignRow,
  campaignHref,
  panel,
  pill,
  SectionLabel,
} from "./_components";
import { TrackerTable } from "./TrackerTable";

export const metadata: Metadata = { title: "Wander Performance" };
export const dynamic = "force-dynamic";

type Hand = {
  key: string;
  brand: DeskBrand;
  href: string;
  reason: string;
  action: string;
};

/** The morning page: what is spending, what needs a hand, what is in progress. */
export default async function PerformanceDashboardPage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");
  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization;
  if (!org)
    return <div className="text-muted-foreground">No organization found.</div>;

  const [desk, tracker] = await Promise.all([
    loadPerformanceDesk(org.id).then((all) => narrowDesk(all, "client")),
    loadPerformanceTracker(org.id),
  ]);
  const brandById = new Map(desk.brands.map((brand) => [brand.id, brand]));

  // What needs a person, each with the one move that clears it.
  const hands: Hand[] = [];
  for (const campaign of desk.campaigns) {
    const brand = brandById.get(campaign.brandId);
    if (!brand) continue;
    const href = campaignHref(brand, campaign);
    if (campaign.state === "draft" && campaign.adCount === 0) {
      hands.push({
        key: campaign.id,
        brand,
        href,
        reason: `${campaign.name} has no ads in it yet.`,
        action: "Add the first ad",
      });
    } else if (campaign.state === "draft" && campaign.platforms.length === 0) {
      hands.push({
        key: campaign.id,
        brand,
        href,
        reason: `${campaign.name} has ads but no platform planned.`,
        action: "Plan a platform",
      });
    } else if (campaign.state === "live" && campaign.pace === "behind") {
      hands.push({
        key: campaign.id,
        brand,
        href,
        reason: `${campaign.name} is spending behind pace.`,
        action: "Open campaign",
      });
    }
  }
  for (const brand of desk.brands) {
    if (brand.campaigns.length === 0) {
      hands.push({
        key: brand.id,
        brand,
        href: brandAdsHref(brand),
        reason: "No campaign yet.",
        action: "Start a campaign",
      });
    } else if (brand.delivery === "ads_review") {
      const campaign = brand.campaigns.find(
        (row) => row.state === "draft" && row.adCount > 0,
      );
      hands.push({
        key: `${brand.id}:review`,
        brand,
        href: campaign ? campaignHref(brand, campaign) : brandAdsHref(brand),
        reason: "Ads drafted and a platform planned. Review, then push.",
        action: "Review the ads",
      });
    }
  }
  const uncapped = desk.live.filter((campaign) => campaign.budget === 0).length;

  const withBrand = (rows: DeskCampaign[]) =>
    rows.flatMap((campaign) => {
      const brand = brandById.get(campaign.brandId);
      return brand ? [{ campaign, brand }] : [];
    });
  const pushed = withBrand(
    desk.campaigns.filter((campaign) => campaign.state === "pushed"),
  );
  const drafts = withBrand(
    desk.campaigns.filter((campaign) => campaign.state === "draft"),
  );

  return (
    <div className="space-y-7">
      <div>
        <div className="grid grid-cols-3 gap-2 @xl:gap-3">
          <Figure
            href="/app/performance/campaigns"
            label="Live campaigns"
            value={String(desk.live.length)}
            sub={
              desk.live.length === 0
                ? "Nothing spending"
                : uncapped > 0
                  ? `${deskMoney(desk.liveSpend)} spent · ${uncapped === desk.live.length ? "no" : `${desk.live.length - uncapped} of ${desk.live.length} with a`} budget cap`
                  : `${deskMoney(desk.liveSpend)} spent of ${deskMoney(desk.liveBudget)}`
            }
            subTone={uncapped > 0 ? "amber" : "muted"}
          />
          <Figure
            href="/app/performance/clients"
            label="Clients"
            value={String(desk.clients)}
            sub={`${desk.prospects} prospect${desk.prospects === 1 ? "" : "s"} courting`}
          />
          <Figure
            label="Needs a hand"
            value={String(hands.length)}
            sub={hands.length ? "listed below" : "nothing waiting"}
            tone={hands.length ? "amber" : "muted"}
          />
        </div>
      </div>

      {tracker.length > 0 && (
        <section className="space-y-2.5">
          <div className="flex items-baseline justify-between">
            <SectionLabel>Tracker</SectionLabel>
            <Link
              href="/app/performance/tracker"
              className="inline-flex items-center gap-1 text-[11.5px] text-sky-300 hover:underline"
            >
              Open <ArrowRight className="size-3" />
            </Link>
          </div>
          <TrackerTable rows={tracker} mobileCollapsed />
        </section>
      )}

      {desk.brands.length === 0 ? (
        <EmptyState
          icon={Crosshair}
          title="No clients yet"
          description="Prospects become clients on the Prospects tab."
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="space-y-7">
            <section className="space-y-2.5">
              <SectionLabel>Live now</SectionLabel>
              {desk.live.length === 0 ? (
                <p
                  className={cn(
                    panel,
                    "px-4 py-6 text-center text-xs text-muted-foreground",
                  )}
                >
                  Nothing live.
                </p>
              ) : (
                <div className={panel}>
                  <ul className="divide-y">
                    {desk.live.map((campaign) => (
                      <CampaignRow
                        key={campaign.id}
                        brand={brandById.get(campaign.brandId)!}
                        campaign={campaign}
                        showBrand
                      />
                    ))}
                  </ul>
                  {uncapped > 0 ? (
                    <div className="flex items-center justify-between gap-3 border-t bg-amber-500/5 px-4 py-2.5 text-[11.5px]">
                      <span className="text-amber-300">
                        {uncapped === desk.live.length
                          ? "Live with no budget cap; spend is unbounded."
                          : `${uncapped} live with no budget cap.`}
                      </span>
                      <Link
                        href="/app/performance/campaigns"
                        className="text-sky-300 hover:underline"
                      >
                        Set budgets
                      </Link>
                    </div>
                  ) : null}
                </div>
              )}
            </section>

            {pushed.length > 0 ? (
              <section className="space-y-2.5">
                <SectionLabel>Pushed, paused · {pushed.length}</SectionLabel>
                <ul className={cn(panel, "divide-y")}>
                  {pushed.map(({ campaign, brand }) => (
                    <CampaignRow
                      key={campaign.id}
                      brand={brand}
                      campaign={campaign}
                      showBrand
                    />
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="space-y-2.5">
              <div className="flex items-baseline justify-between">
                <SectionLabel>Drafts · {drafts.length}</SectionLabel>
                <Link
                  href="/app/performance/campaigns"
                  className="inline-flex items-center gap-1 text-[11.5px] text-sky-300 hover:underline"
                >
                  All campaigns <ArrowRight className="size-3" />
                </Link>
              </div>
              {drafts.length === 0 ? (
                <p
                  className={cn(
                    panel,
                    "px-4 py-6 text-center text-xs text-muted-foreground",
                  )}
                >
                  No drafts.
                </p>
              ) : (
                <ul className={cn(panel, "divide-y")}>
                  {drafts.slice(0, 6).map(({ campaign, brand }) => (
                    <CampaignRow
                      key={campaign.id}
                      brand={brand}
                      campaign={campaign}
                      showBrand
                    />
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="space-y-2.5">
            <SectionLabel tone={hands.length ? "amber" : "muted"}>
              Needs a hand
            </SectionLabel>
            {hands.length === 0 ? (
              <p
                className={cn(
                  panel,
                  "px-4 py-6 text-center text-xs text-muted-foreground",
                )}
              >
                Nothing waiting.
              </p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {hands.slice(0, 6).map((hand) => (
                  <div key={hand.key} className={cn(panel, "p-4")}>
                    <div className="flex items-center gap-2.5">
                      <BrandLogo
                        brand={hand.brand}
                        className="size-8 text-[11px]"
                      />
                      <span className="truncate text-[12.5px] font-semibold">
                        {hand.brand.name}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      {hand.reason}
                    </p>
                    <Link
                      href={hand.href}
                      className={cn(
                        pill,
                        "mt-2.5 inline-flex items-center border border-border/80 px-3 py-1 text-[11.5px] font-semibold hover:bg-muted/60",
                      )}
                    >
                      {hand.action}
                    </Link>
                  </div>
                ))}
                {hands.length > 6 ? (
                  <Link
                    href="/app/performance/campaigns"
                    className="text-[11.5px] text-muted-foreground hover:underline"
                  >
                    {hands.length - 6} more on Campaigns
                  </Link>
                ) : null}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

/** A figure that opens its tab. The attention figure goes amber when there is something to do. */
function Figure({
  href,
  label,
  value,
  sub,
  tone = "muted",
  subTone,
}: {
  href?: string;
  label: string;
  value: string;
  sub: string;
  tone?: "muted" | "amber";
  subTone?: "muted" | "amber";
}) {
  const body = (
    <>
      <SectionLabel
        tone={tone}
        className="min-h-8 text-[10.5px] tracking-[0.07em] @xl:min-h-0"
      >
        {label}
      </SectionLabel>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums">
        {value}
      </p>
      <p
        className={cn(
          "mt-1 text-xs",
          (subTone ?? tone) === "amber"
            ? "text-amber-300"
            : "text-muted-foreground",
        )}
      >
        {sub}
      </p>
    </>
  );
  const frame = cn(
    "block min-w-0 rounded-2xl border p-2.5 text-left @xl:p-4",
    tone === "amber" ? "border-amber-500/35 bg-card" : "bg-card",
    href && "transition-colors hover:border-foreground/25",
  );
  return href ? (
    <Link href={href} className={frame}>
      {body}
    </Link>
  ) : (
    <div className={frame}>{body}</div>
  );
}
