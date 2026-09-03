import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import {
  platformAdTable,
  brandTable,
  platformCampaignTable,
  campaignTable,
  memberTable,
} from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { posterForMedia } from "@/lib/media-url";

import { fmtDate, money, statusStyle } from "./format";
import { DeletePlatformCampaign } from "./DeletePlatformCampaign";
import { DeliverySwitch } from "./DeliverySwitch";
import { CampaignLink } from "./CampaignLink";
import { ImportCreativeButton } from "./ImportCreativeButton";

/**
 * One platform campaign: a view-only display of its state,
 * money, its ads. Nothing here is a form; edits happen in chat and this page
 * just renders current state. The one control is the delivery switch, because
 * launching by button click is a deliberate operator moment.
 */
export async function PlatformCampaignView({
  brandSlug,
  platformCampaignId,
}: {
  brandSlug: string;
  platformCampaignId: string;
}) {
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

  const platformCampaign = await db.query.platformCampaignTable.findFirst({
    where: and(
      eq(platformCampaignTable.id, platformCampaignId),
      eq(platformCampaignTable.brandId, brand.id),
    ),
  });
  if (!platformCampaign) notFound();

  const [spots, campaign] = await Promise.all([
    db.query.platformAdTable.findMany({
      where: eq(platformAdTable.platformCampaignId, platformCampaign.id),
    }),
    platformCampaign.campaignId
      ? db.query.campaignTable.findFirst({
          where: eq(campaignTable.id, platformCampaign.campaignId),
          columns: { id: true, name: true },
        })
      : Promise.resolve(null),
  ]);

  const stats = platformCampaign.stats ?? {};
  const statCards: { label: string; value: string }[] = [
    { label: "Spend", value: money(stats.spend ?? platformCampaign.spend) },
    ...(platformCampaign.budget != null
      ? [{ label: "Budget", value: money(platformCampaign.budget) }]
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

  const sortedSpots = [...spots].sort((a, b) =>
    (a.name ?? "").localeCompare(b.name ?? ""),
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
              <ChannelLogo
                platform={platformCampaign.platform}
                className="size-6"
              />
              <h1 className="truncate text-xl font-semibold tracking-tight">
                {platformCampaign.name}
              </h1>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${statusStyle(
                  platformCampaign.status,
                )}`}
              >
                {platformCampaign.status}
              </span>
            </div>
            <p className="text-muted-foreground mt-1 text-sm">
              {platformLabel(platformCampaign.platform)}
              {platformCampaign.objective
                ? ` · ${platformCampaign.objective}`
                : ""}{" "}
              · {fmtDate(platformCampaign.startAt) ?? "—"} –{" "}
              {fmtDate(platformCampaign.endAt) ?? "—"}
            </p>
            <div className="mt-2">
              <CampaignLink
                brandId={brand.id}
                brandSlug={brandSlug}
                platformCampaignId={platformCampaign.id}
                campaign={campaign ?? null}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {platformCampaign.manageUrl && (
              <a
                href={platformCampaign.manageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:bg-accent rounded-md border px-3 py-1.5 text-sm font-medium"
              >
                Open in platform ↗
              </a>
            )}
            <DeletePlatformCampaign
              platformCampaignId={platformCampaign.id}
              campaignName={platformCampaign.name}
              brandSlug={brandSlug}
              isLive={platformCampaign.status === "live"}
              spend={platformCampaign.spend}
            />
            <DeliverySwitch
              platformCampaignId={platformCampaign.id}
              status={platformCampaign.status}
              hasExternalId={Boolean(platformCampaign.externalId)}
              spendLine={
                platformCampaign.budget != null
                  ? `${money(platformCampaign.budget)} budget`
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
                  <ImportCreativeButton platformAdId={spot.id} />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={
                      posterForMedia(spot.media?.[0]) ??
                      spot.thumbnailUrl ??
                      "/placeholder.svg"
                    }
                    alt=""
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute top-1.5 right-1.5 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white capitalize backdrop-blur-sm">
                    {spot.status ?? "live"}
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
