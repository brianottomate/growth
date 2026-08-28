import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import {
  adSpotTable,
  brandTable,
  campaignTable,
  initiativeTable,
  memberTable,
} from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { ChannelLogo, platformLabel } from "@/components/channel-logos";

import { DeliverySwitch } from "./DeliverySwitch";
import { InitiativeLink } from "./InitiativeLink";

export const dynamic = "force-dynamic";

const money = (n: number | null | undefined) =>
  n == null
    ? "—"
    : n >= 1000
      ? `$${(n / 1000).toFixed(1)}K`
      : `$${n.toLocaleString()}`;

const fmtDate = (d: Date | null) =>
  d
    ? d.toLocaleDateString([], {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

const STATUS_STYLE: Record<string, string> = {
  live: "bg-emerald-500/15 text-emerald-300",
  scheduled: "bg-sky-500/15 text-sky-300",
  paused: "bg-amber-500/15 text-amber-300",
  ended: "bg-muted text-muted-foreground",
  draft: "bg-muted text-muted-foreground",
};

/**
 * The campaign canvas: a view-only display of one campaign — its state, its
 * money, its ads. Nothing here is a form; edits happen in chat and this page
 * just renders current state. The one control is the delivery switch, because
 * launching by button click is a deliberate operator moment.
 */
export default async function CampaignPage({
  params,
}: {
  params: Promise<{ brandSlug: string; campaignId: string }>;
}) {
  const { brandSlug, campaignId } = await params;
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
    columns: { id: true, name: true, slug: true },
  });
  if (!brand) notFound();

  const campaign = await db.query.campaignTable.findFirst({
    where: and(
      eq(campaignTable.id, campaignId),
      eq(campaignTable.brandId, brand.id),
    ),
  });
  if (!campaign) notFound();

  const [spots, initiative] = await Promise.all([
    db.query.adSpotTable.findMany({
      where: eq(adSpotTable.campaignId, campaign.id),
    }),
    campaign.initiativeId
      ? db.query.initiativeTable.findFirst({
          where: eq(initiativeTable.id, campaign.initiativeId),
          columns: { id: true, name: true },
        })
      : Promise.resolve(null),
  ]);

  const stats = campaign.stats ?? {};
  const statCards: { label: string; value: string }[] = [
    { label: "Spend", value: money(stats.spend ?? campaign.spend) },
    ...(campaign.budget != null
      ? [{ label: "Budget", value: money(campaign.budget) }]
      : []),
    ...(stats.impressions != null
      ? [{ label: "Impressions", value: stats.impressions.toLocaleString() }]
      : []),
    ...(stats.clicks != null
      ? [{ label: "Clicks", value: stats.clicks.toLocaleString() }]
      : []),
    ...(stats.ctr != null ? [{ label: "CTR", value: `${stats.ctr}%` }] : []),
    ...(stats.roas != null ? [{ label: "ROAS", value: `${stats.roas}` }] : []),
    ...(stats.purchaseValue != null
      ? [{ label: "Purchase value", value: money(stats.purchaseValue) }]
      : []),
  ];

  // The ads sort drafted-first so a build in progress reads top to bottom.
  const sortedSpots = [...spots].sort((a, b) =>
    (a.externalId ? 1 : 0) - (b.externalId ? 1 : 0) === 0
      ? (a.name ?? "").localeCompare(b.name ?? "")
      : a.externalId
        ? 1
        : -1,
  );

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <header className="space-y-3">
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Link href="/app/brands" className="hover:underline">
            Brands
          </Link>
          <span>/</span>
          <Link href={`/app/brands/${brandSlug}`} className="hover:underline">
            {brand.name}
          </Link>
          <span>/</span>
          <Link
            href={`/app/brands/${brandSlug}/ads`}
            className="hover:underline"
          >
            Ads
          </Link>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <ChannelLogo platform={campaign.platform} className="size-6" />
              <h1 className="truncate text-xl font-semibold tracking-tight">
                {campaign.name}
              </h1>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${
                  STATUS_STYLE[campaign.status] ?? STATUS_STYLE.draft
                }`}
              >
                {campaign.status}
              </span>
            </div>
            <p className="text-muted-foreground mt-1 text-sm">
              {platformLabel(campaign.platform)}
              {campaign.objective ? ` · ${campaign.objective}` : ""} ·{" "}
              {fmtDate(campaign.startAt)} – {fmtDate(campaign.endAt)}
            </p>
            <div className="mt-2">
              <InitiativeLink
                brandId={brand.id}
                campaignId={campaign.id}
                initiative={initiative ?? null}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {campaign.manageUrl && (
              <a
                href={campaign.manageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:bg-accent rounded-md border px-3 py-1.5 text-sm font-medium"
              >
                Open in platform ↗
              </a>
            )}
            <DeliverySwitch
              campaignId={campaign.id}
              status={campaign.status}
              hasExternalId={Boolean(campaign.externalId)}
              spendLine={
                campaign.budget != null
                  ? `${money(campaign.budget)} budget`
                  : "no stored budget"
              }
            />
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {statCards.map((card) => (
          <div key={card.label} className="bg-card rounded-xl border p-3">
            <p className="text-muted-foreground text-xs">{card.label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {card.value}
            </p>
          </div>
        ))}
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">
          Ads{" "}
          <span className="text-muted-foreground text-sm font-normal">
            {spots.length}
          </span>
        </h2>
        {spots.length === 0 ? (
          <div className="text-muted-foreground space-y-1 text-sm">
            <p>
              No ads on this campaign yet. Add one from the brand&apos;s{" "}
              <Link href="/app/media" className="underline">
                media library
              </Link>
              , make something new in{" "}
              <Link href="/app/studio" className="underline">
                the studio
              </Link>
              , or draft them in chat.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sortedSpots.map((spot) => (
              <div
                key={spot.id}
                className="bg-card overflow-hidden rounded-xl border"
              >
                <div className="bg-muted relative aspect-video">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={
                      spot.media?.[0]?.url ??
                      spot.thumbnailUrl ??
                      "/placeholder.svg"
                    }
                    alt=""
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute top-1.5 right-1.5 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white capitalize backdrop-blur-sm">
                    {spot.externalId ? (spot.status ?? "live") : "drafted"}
                  </span>
                </div>
                <div className="space-y-1 p-3">
                  <p className="truncate text-sm font-medium">
                    {spot.name ?? "Untitled ad"}
                  </p>
                  {spot.body && (
                    <p className="text-muted-foreground line-clamp-2 text-xs">
                      {spot.body}
                    </p>
                  )}
                  <p className="text-muted-foreground text-xs tabular-nums">
                    {spot.stats?.spend != null
                      ? `${money(spot.stats.spend)} spent`
                      : "no spend yet"}
                    {spot.stats?.ctr != null ? ` · ${spot.stats.ctr}% CTR` : ""}
                    {spot.adSetName ? ` · ${spot.adSetName}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
