import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { Crosshair } from "lucide-react";

import { db } from "@/server/db";
import { memberTable } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { EmptyState } from "@/components/ui/empty-state";
import {
  deskMoney,
  loadPerformanceDesk,
  narrowDesk,
  type DeskBrand,
  type DeskCampaign,
} from "@/server/services/performance-desk.service";

import { brandAdsHref, BrandLogo, CampaignRow, campaignHref } from "./_components";
import { NewClientDialog } from "./NewClientDialog";

export const metadata: Metadata = { title: "Wander Performance" };
export const dynamic = "force-dynamic";

/**
 * The morning page: what is spending, what needs a hand, and the box that
 * starts a new client. Three numbers, two lists, one action.
 */
export default async function PerformanceDashboardPage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");
  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization;
  if (!org) return <div className="text-muted-foreground">No organization found.</div>;

  const desk = narrowDesk(await loadPerformanceDesk(org.id), "client");
  const brandById = new Map(desk.brands.map((brand) => [brand.id, brand]));

  // What needs a person: drafts with no ads, drafts with ads but no platform,
  // live campaigns behind pace, and clients with nothing started.
  const attention: { key: string; text: string; href: string; brand: DeskBrand }[] = [];
  for (const campaign of desk.campaigns) {
    const brand = brandById.get(campaign.brandId);
    if (!brand) continue;
    if (campaign.state === "draft" && campaign.adCount === 0) {
      attention.push({ key: campaign.id, brand, href: campaignHref(brand, campaign), text: `${campaign.name} has no ads yet` });
    } else if (campaign.state === "draft" && campaign.platforms.length === 0) {
      attention.push({ key: campaign.id, brand, href: campaignHref(brand, campaign), text: `${campaign.name} has ads but no platform planned` });
    } else if (campaign.state === "live" && campaign.pace === "behind") {
      attention.push({ key: campaign.id, brand, href: campaignHref(brand, campaign), text: `${campaign.name} is behind pace` });
    }
  }
  for (const brand of desk.brands) {
    if (brand.campaigns.length === 0) {
      attention.push({ key: brand.id, brand, href: brandAdsHref(brand), text: `${brand.name} has no campaign yet` });
    }
  }

  const recent: { campaign: DeskCampaign; brand: DeskBrand }[] = desk.campaigns
    .filter((campaign) => campaign.state !== "live")
    .slice(0, 6)
    .flatMap((campaign) => {
      const brand = brandById.get(campaign.brandId);
      return brand ? [{ campaign, brand }] : [];
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 @4xl:flex-row @4xl:items-start @4xl:justify-between">
        <div className="grid grid-cols-1 gap-3 @xl:grid-cols-3 @4xl:flex-1">
          <Figure label="Live campaigns" value={String(desk.live.length)} sub={
              desk.live.length === 0
                ? "Nothing spending"
                : desk.liveBudget > 0
                  ? `${deskMoney(desk.liveSpend)} spent of ${deskMoney(desk.liveBudget)}`
                  : `${deskMoney(desk.liveSpend)} spent, no budget set`
            } />
          <Figure
            label="Clients"
            value={String(desk.clients)}
            sub={`${desk.prospects} prospect${desk.prospects === 1 ? "" : "s"} on the Prospects tab`}
          />
          <Figure label="Needs a hand" value={String(attention.length)} sub={attention.length ? "listed below" : "All caught up"} />
        </div>
        <div className="@4xl:pt-1">
          <NewClientDialog size="default" />
        </div>
      </div>

      {desk.brands.length === 0 ? (
        <EmptyState
          icon={Crosshair}
          title="No clients yet"
          description="Prospects become clients on the Prospects tab."
          actions={<NewClientDialog />}
        />
      ) : (
        <div className="grid gap-6 @4xl:grid-cols-2">
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Live now</h2>
            {desk.live.length === 0 ? (
              <p className="text-muted-foreground bg-card rounded-xl border px-4 py-6 text-center text-xs">
                Nothing live.
              </p>
            ) : (
              <ul className="bg-card divide-y rounded-xl border">
                {desk.live.map((campaign) => {
                  const brand = brandById.get(campaign.brandId)!;
                  return <CampaignRow key={campaign.id} brand={brand} campaign={campaign} showBrand />;
                })}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Needs a hand</h2>
            {attention.length === 0 ? (
              <p className="text-muted-foreground bg-card rounded-xl border px-4 py-6 text-center text-xs">
                Nothing waiting.
              </p>
            ) : (
              <ul className="bg-card divide-y rounded-xl border">
                {attention.slice(0, 8).map((item) => (
                  <li key={item.key} className="flex items-center gap-3 px-4 py-2.5">
                    <BrandLogo brand={item.brand} className="size-6" />
                    <Link href={item.href} className="min-w-0 flex-1 truncate text-sm hover:underline">
                      {item.text}
                    </Link>
                  </li>
                ))}
                {attention.length > 8 ? (
                  <li className="text-muted-foreground px-4 py-2 text-xs">
                    <Link href="/app/performance/campaigns" className="hover:underline">
                      {attention.length - 8} more on the campaigns page
                    </Link>
                  </li>
                ) : null}
              </ul>
            )}
          </section>

          <section className="space-y-2 @4xl:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">In progress</h2>
              <Link href="/app/performance/campaigns" className="text-muted-foreground text-xs hover:underline">
                All campaigns
              </Link>
            </div>
            {recent.length === 0 ? (
              <p className="text-muted-foreground bg-card rounded-xl border px-4 py-6 text-center text-xs">
                No drafts.
              </p>
            ) : (
              <ul className="bg-card divide-y rounded-xl border">
                {recent.map(({ campaign, brand }) => (
                  <CampaignRow key={campaign.id} brand={brand} campaign={campaign} showBrand />
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Figure({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-card flex items-baseline justify-between gap-3 rounded-xl border p-4 @xl:block">
      <div className="min-w-0">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="text-muted-foreground text-[11px] @xl:hidden">{sub}</p>
      </div>
      <p className="text-2xl font-semibold tabular-nums @xl:mt-1">{value}</p>
      <p className="text-muted-foreground hidden text-[11px] @xl:block">{sub}</p>
    </div>
  );
}
