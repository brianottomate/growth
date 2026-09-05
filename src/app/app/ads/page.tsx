import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { Crosshair, ExternalLink } from "lucide-react";

import { db } from "@/server/db";
import {
  brandTable,
  campaignTable,
  memberTable,
  platformCampaignTable,
  type PlatformCampaign,
} from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/components/ui/lib/utils";

import { NewClientBox } from "./NewClientBox";

const money = (n: number | null | undefined) =>
  n == null ? "—" : n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${Math.round(n)}`;

type CampaignState = "draft" | "pushed" | "live" | "ended";

const STATE_STYLE: Record<CampaignState, string> = {
  draft: "bg-muted text-muted-foreground",
  pushed: "bg-sky-500/15 text-sky-300",
  live: "bg-emerald-500/15 text-emerald-300",
  ended: "bg-muted text-muted-foreground",
};

/** Where a campaign stands, from its platform rows. */
function stateOf(rows: PlatformCampaign[]): CampaignState {
  if (rows.some((row) => row.status === "live")) return "live";
  if (rows.some((row) => row.externalId)) {
    return rows.every((row) => row.status === "ended") ? "ended" : "pushed";
  }
  return "draft";
}

/**
 * Spend against budget, read against time when the platform has dates. A
 * campaign 40% through its window that has spent 20% is behind; the note says
 * so in words rather than leaving the arithmetic to the reader.
 */
function pacing(rows: PlatformCampaign[]) {
  const spend = rows.reduce((sum, row) => sum + (row.stats?.spend ?? row.spend ?? 0), 0);
  const budget = rows.reduce((sum, row) => sum + (row.budget ?? 0), 0);
  const dated = rows.filter((row) => row.startAt && row.endAt && row.budget);
  let note: string | null = null;
  if (budget > 0 && dated.length > 0) {
    const now = Date.now();
    const expected = dated.reduce((sum, row) => {
      const start = row.startAt!.getTime();
      const end = row.endAt!.getTime();
      const fraction = end > start ? Math.min(1, Math.max(0, (now - start) / (end - start))) : 1;
      return sum + fraction * (row.budget ?? 0);
    }, 0);
    if (expected > 0) {
      const ratio = spend / expected;
      note = ratio > 1.15 ? "ahead of pace" : ratio < 0.85 ? "behind pace" : "on pace";
    }
  }
  return { spend, budget, note };
}

/**
 * The ads desk: every client and prospect with where their campaigns stand,
 * and the box that starts a new one. Built for the person who runs paid media
 * across clients and should not have to open each brand to know the day.
 */
export default async function AdsDeskPage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization;
  if (!org) {
    return <div className="text-muted-foreground">No organization found.</div>;
  }

  const brands = await db.query.brandTable.findMany({
    where: and(eq(brandTable.organizationId, org.id), isNull(brandTable.deletedAt)),
    columns: { id: true, name: true, slug: true, logo: true, relationship: true, website: true },
    orderBy: (brand, { asc }) => [asc(brand.name)],
  });
  const brandIds = brands.map((brand) => brand.id);
  const campaigns = brandIds.length
    ? await db.query.campaignTable.findMany({
        where: and(inArray(campaignTable.brandId, brandIds), isNull(campaignTable.deletedAt)),
        columns: { id: true, brandId: true, name: true, budget: true, createdAt: true },
        orderBy: (campaign, { desc }) => [desc(campaign.createdAt)],
      })
    : [];
  const platformRows = campaigns.length
    ? await db.query.platformCampaignTable.findMany({
        where: inArray(
          platformCampaignTable.campaignId,
          campaigns.map((campaign) => campaign.id),
        ),
      })
    : [];
  const rowsByCampaign = new Map<string, PlatformCampaign[]>();
  for (const row of platformRows) {
    if (!row.campaignId) continue;
    rowsByCampaign.set(row.campaignId, [...(rowsByCampaign.get(row.campaignId) ?? []), row]);
  }
  const campaignsByBrand = new Map<string, typeof campaigns>();
  for (const campaign of campaigns) {
    campaignsByBrand.set(campaign.brandId, [
      ...(campaignsByBrand.get(campaign.brandId) ?? []),
      campaign,
    ]);
  }

  // Clients and prospects always show; an internal brand only once it runs ads.
  const rank: Record<CampaignState, number> = { live: 0, pushed: 1, draft: 2, ended: 3 };
  const desk = brands
    .filter(
      (brand) =>
        brand.relationship === "client" ||
        brand.relationship === "prospect" ||
        (campaignsByBrand.get(brand.id)?.length ?? 0) > 0,
    )
    .map((brand) => {
      const own = (campaignsByBrand.get(brand.id) ?? []).map((campaign) => {
        const rows = rowsByCampaign.get(campaign.id) ?? [];
        return { ...campaign, rows, state: stateOf(rows), ...pacing(rows) };
      });
      const best = own.reduce<CampaignState | null>(
        (acc, campaign) => (acc === null || rank[campaign.state] < rank[acc] ? campaign.state : acc),
        null,
      );
      return { brand, campaigns: own, best };
    })
    .sort((a, b) => {
      const ra = a.best ? rank[a.best] : 4;
      const rb = b.best ? rank[b.best] : 4;
      if (ra !== rb) return ra - rb;
      if (a.brand.relationship !== b.brand.relationship) {
        return a.brand.relationship === "client" ? -1 : 1;
      }
      return a.brand.name.localeCompare(b.brand.name);
    });

  const liveSpend = desk
    .flatMap((row) => row.campaigns)
    .filter((campaign) => campaign.state === "live")
    .reduce((sum, campaign) => sum + campaign.spend, 0);
  const liveCount = desk.flatMap((row) => row.campaigns).filter((c) => c.state === "live").length;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Ads</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Every client and where their campaigns stand.
            {liveCount > 0
              ? ` ${liveCount} live, ${money(liveSpend)} spent so far.`
              : " Nothing is spending right now."}{" "}
            <Link href="/app/ads/conversions" className="underline">
              Conversion mapping
            </Link>
          </p>
        </div>
        <NewClientBox />
      </div>

      {desk.length === 0 ? (
        <EmptyState
          icon={Crosshair}
          title="No clients yet"
          description="Paste a website above. The assistant creates the brand, reads its logo and colours, pulls listing photos, opens a campaign shell and drafts the first ads. Nothing is pushed until you say so."
        />
      ) : (
        <div className="space-y-3">
          {desk.map(({ brand, campaigns: own }) => (
            <section key={brand.id} className="bg-card rounded-xl border">
              <div className="flex items-center gap-3 px-4 py-3">
                {brand.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={brand.logo}
                    alt=""
                    className="size-8 shrink-0 rounded-md border bg-white object-contain p-0.5"
                  />
                ) : (
                  <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-md text-xs font-semibold">
                    {brand.name.slice(0, 1)}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/app/brands/${brand.slug ?? brand.id}/ads`}
                      className="truncate text-sm font-semibold hover:underline"
                    >
                      {brand.name}
                    </Link>
                    <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-medium capitalize">
                      {brand.relationship}
                    </span>
                  </div>
                  {brand.website ? (
                    <a
                      href={brand.website}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground inline-flex items-center gap-1 text-[11px] hover:underline"
                    >
                      {brand.website.replace(/^https?:\/\//, "")}
                      <ExternalLink className="size-3" />
                    </a>
                  ) : null}
                </div>
                <Link
                  href={`/app/brands/${brand.slug ?? brand.id}/ads`}
                  className="text-muted-foreground hover:text-foreground text-xs"
                >
                  {own.length === 0 ? "Start a campaign" : `${own.length} campaign${own.length === 1 ? "" : "s"}`}
                </Link>
              </div>
              {own.length > 0 ? (
                <ul className="divide-y border-t">
                  {own.map((campaign) => (
                    <li key={campaign.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span
                        className={cn(
                          "w-14 shrink-0 rounded-full px-2 py-0.5 text-center text-[10px] font-medium capitalize",
                          STATE_STYLE[campaign.state],
                        )}
                      >
                        {campaign.state}
                      </span>
                      <Link
                        href={`/app/brands/${brand.slug ?? brand.id}/ads/${campaign.id}`}
                        className="min-w-0 flex-1 truncate text-sm hover:underline"
                      >
                        {campaign.name}
                      </Link>
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        {campaign.rows.map((row) => (
                          <span key={row.id} title={`${platformLabel(row.platform)} · ${row.status}`}>
                            <ChannelLogo platform={row.platform} className="size-3.5" />
                          </span>
                        ))}
                      </span>
                      <span className="w-36 shrink-0 text-right text-xs tabular-nums">
                        {campaign.state === "draft" ? (
                          <span className="text-muted-foreground">
                            {campaign.budget != null ? `${money(campaign.budget)} planned` : "no budget"}
                          </span>
                        ) : (
                          <>
                            <span className="font-medium">{money(campaign.spend)}</span>
                            <span className="text-muted-foreground">
                              {campaign.budget > 0 ? ` of ${money(campaign.budget)}` : ""}
                            </span>
                            {campaign.note ? (
                              <span
                                className={cn(
                                  "ml-1.5",
                                  campaign.note === "behind pace"
                                    ? "text-amber-300"
                                    : campaign.note === "ahead of pace"
                                      ? "text-sky-300"
                                      : "text-muted-foreground",
                                )}
                              >
                                {campaign.note}
                              </span>
                            ) : null}
                          </>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
