import {
  WorkspaceCard,
  WorkspaceCardHeader,
} from "@/app/app/performance/WorkspaceCard";
import { ChartNoAxesCombined, Images } from "lucide-react";
import { workspaceActor } from "@/server/workspace-actor";

import {
  campaignListPath,
  campaignPath,
  type CampaignWorkspace,
} from "@/lib/campaign-navigation";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import {
  platformAdTable,
  platformDeliveryGroupTable,
  brandTable,
  platformCampaignTable,
  campaignTable,
} from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { posterForMedia } from "@/lib/media-url";

import { fmtDate, money, statusStyle } from "./format";
import { DeletePlatformCampaign } from "./DeletePlatformCampaign";
import { DeliverySwitch } from "./DeliverySwitch";
import { CampaignLink } from "./CampaignLink";
import { MetaDeliverySummary } from "./MetaDeliverySummary";
import { PushedMetaGroups } from "./PushedMetaGroups";
import { PushedSearchGroups } from "./PushedSearchGroups";
import { ImportCreativeButton } from "./ImportCreativeButton";

/**
 * One platform campaign: a view-only display of its state,
 * money, its ads. Nothing here is a form; edits happen in chat and this page
 * just renders current state. The one control is the delivery switch, because
 * launching by button click is a deliberate operator moment.
 */
export async function PlatformCampaignView({
  brandSlug,
  workspace = "brand",
  platformCampaignId,
}: {
  brandSlug: string;
  workspace?: CampaignWorkspace;
  platformCampaignId: string;
}) {
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  const actor = await workspaceActor();
  if (!actor) notFound();
  const org = { id: actor.orgId };

  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.slug, brandSlug),
      eq(brandTable.organizationId, org.id),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true, name: true, slug: true, metaPageId: true },
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

  const isSearch =
    platformCampaign.platform === "google_ads" &&
    platformCampaign.settings?.google?.campaignType === "search";
  const deliveryGroups =
    isSearch || platformCampaign.platform === "meta_ads"
      ? await db.query.platformDeliveryGroupTable.findMany({
          where: eq(
            platformDeliveryGroupTable.platformCampaignId,
            platformCampaign.id,
          ),
        })
      : [];

  const stats = platformCampaign.stats ?? {};
  const statCards: { label: string; value: string }[] = [
    { label: "Spend", value: money(stats.spend ?? platformCampaign.spend) },
    ...(platformCampaign.budget != null
      ? [
          {
            label: "Budget",
            value: `${money(platformCampaign.budget)}${platformCampaign.budgetType === "daily" ? "/day" : " lifetime"}`,
          },
        ]
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
    <div className="space-y-4">
      <header className="space-y-3 rounded-xl border bg-background p-4">
        {workspace !== "performance" && (
          <>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Link href={"/app/brands"} className="hover:underline">
                Brands
              </Link>
              <span>/</span>
              <Link
                href={`/app/brands/${brandSlug}`}
                className="hover:underline"
              >
                {brand.name}
              </Link>
              <span>/</span>
              <Link
                href={campaignListPath(brandSlug, workspace)}
                className="hover:underline"
              >
                Ads
              </Link>
            </div>
          </>
        )}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <ChannelLogo
                platform={platformCampaign.platform}
                className="size-6"
              />
              <h2 className="truncate text-base font-semibold tracking-tight">
                {platformCampaign.name}
              </h2>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${statusStyle(
                  platformCampaign.status,
                )}`}
              >
                {platformCampaign.status}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {platformLabel(platformCampaign.platform)}
              {platformCampaign.objective
                ? ` · ${platformCampaign.objective}`
                : ""}{" "}
              · {fmtDate(platformCampaign.startAt) ?? "—"} –{" "}
              {fmtDate(platformCampaign.endAt) ?? "—"}
            </p>
            <div className="mt-2">
              <CampaignLink
                workspace={workspace}
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
                className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
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
                  ? `${money(platformCampaign.budget)}${platformCampaign.budgetType === "daily" ? "/day" : " lifetime"} budget`
                  : "no stored budget"
              }
            />
          </div>
        </div>
      </header>

      <WorkspaceCard title="Results" icon={ChartNoAxesCombined}>
        <div className="grid grid-cols-2 gap-3 @xl:grid-cols-4">
          {statCards.map((card) => (
            <div key={card.label} className="rounded-xl border bg-card p-3">
              <p className="text-xs text-muted-foreground">{card.label}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                {card.value}
              </p>
            </div>
          ))}
        </div>
      </WorkspaceCard>
      {platformCampaign.platform === "meta_ads" && (
        <section className="space-y-4 rounded-xl border bg-background p-4">
          <h3 className="text-sm font-semibold">Delivery setup</h3>
          <MetaDeliverySummary
            pc={platformCampaign}
            pageId={brand.metaPageId}
          />
        </section>
      )}
      <section className="space-y-4 rounded-xl border bg-background p-4">
        <WorkspaceCardHeader title="Ads" icon={Images} count={spots.length} />
        {spots.length === 0 ? (
          <div className="space-y-1 text-sm text-muted-foreground">
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
        ) : platformCampaign.platform === "meta_ads" ? (
          <PushedMetaGroups
            groups={deliveryGroups}
            ads={spots}
            pc={platformCampaign}
            allowImport
            campaignHref={
              campaign
                ? campaignPath(brandSlug, campaign.id, workspace)
                : undefined
            }
          />
        ) : isSearch ? (
          <PushedSearchGroups
            groups={deliveryGroups}
            ads={spots}
            campaignHref={
              campaign
                ? campaignPath(brandSlug, campaign.id, workspace)
                : undefined
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 @xl:grid-cols-2 @4xl:grid-cols-3">
            {sortedSpots.map((spot) => (
              <div
                key={spot.id}
                className="overflow-hidden rounded-xl border bg-card"
              >
                <div className="relative aspect-video bg-muted">
                  <ImportCreativeButton platformAdId={spot.id} />
                  {/* oxlint-disable-next-line nextjs/no-img-element */}
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
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {spot.body}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground tabular-nums">
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
