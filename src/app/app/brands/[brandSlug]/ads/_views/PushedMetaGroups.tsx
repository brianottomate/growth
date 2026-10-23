import { META_PLACEMENTS } from "@/lib/meta-placement-plan";
import { RefreshMeta } from "./RefreshMeta";
import { AddMetaDeliveryGroup } from "./AddMetaDeliveryGroup";
import { db } from "@/server/db";
import { audienceTable } from "@/server/db/ads-schema";
import { eq } from "drizzle-orm";
import { MetaAdditions } from "./MetaAdditions";
import { ChevronDown } from "lucide-react";
import type {
  PlatformAd,
  PlatformCampaign,
  PlatformDeliveryGroup,
} from "@/server/db/ads-schema";
import { adPlatformSpec } from "@/lib/ad-platforms";
import { DeliveryTargetingSummary } from "./DeliveryTargetingSummary";
import { MetaCreativePreview } from "./MetaCreativePreview";
import { ImportCreativeButton } from "./ImportCreativeButton";
import { money } from "./format";
import { SeedLookalikeStep } from "./SeedLookalikeStep";
import type { NewSeedListContext } from "@/app/app/performance/clients/[brandSlug]/NewSeedList";

/** Native delivery relationships and observed creative, independent of the editable plan. */
export async function PushedMetaGroups({
  groups,
  ads,
  pc,
  campaignHref = "",
  allowImport = false,
  seed,
}: {
  groups: PlatformDeliveryGroup[];
  ads: PlatformAd[];
  pc: PlatformCampaign;
  campaignHref?: string;
  allowImport?: boolean;
  /** Shows each ad set's seed line; omitted where seeds do not apply. */
  seed?: { brandId: string; brandName: string; context?: NewSeedListContext };
}) {
  const audiences = pc.campaignId
    ? await db.query.audienceTable.findMany({
        where: eq(audienceTable.campaignId, pc.campaignId),
        columns: { id: true, name: true, type: true },
      })
    : [];
  const account =
    pc.settings?.meta?.destination?.adAccountId ??
    (pc.manageUrl ? new URL(pc.manageUrl).searchParams.get("act") : null);
  const metaLink = (ad: PlatformAd) =>
    account && pc.externalId && ad.externalAdSetId && ad.externalId
      ? adPlatformSpec("meta_ads")?.adManageUrl?.({
          accountId: account,
          campaignId: pc.externalId,
          adSetId: ad.externalAdSetId,
          adId: ad.externalId,
        })
      : ad.manageUrl;
  const renderAd = (ad: PlatformAd) => (
    <MetaCreativePreview
      key={ad.id}
      {...ad}
      actions={
        allowImport ? (
          <span className="relative inline-flex size-8">
            <ImportCreativeButton platformAdId={ad.id} />
          </span>
        ) : undefined
      }
      planHref={ad.adId ? `${campaignHref}#ad-${ad.adId}` : undefined}
      manageUrl={metaLink(ad)}
    />
  );
  const ungrouped = ads.filter(
    (ad) => !groups.some((group) => group.id === ad.platformDeliveryGroupId),
  );
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {pc.campaignId && <RefreshMeta platformCampaignId={pc.id} />}
        <h4 className="text-sm font-semibold">Ad sets · {groups.length}</h4>
        {pc.campaignId && pc.status !== "ended" && (
          <AddMetaDeliveryGroup
            platformCampaignId={pc.id}
            audiences={audiences}
          />
        )}
      </div>
      {groups.map((group) => {
        const groupAds = ads.filter(
          (ad) => ad.platformDeliveryGroupId === group.id,
        );
        const targeting =
          group.configuration?.platform === "meta_ads"
            ? group.configuration.targeting
            : undefined;
        const setLink =
          account && group.externalId
            ? `https://adsmanager.facebook.com/adsmanager/manage/adsets?act=${encodeURIComponent(account.replace(/^act_/i, ""))}&selected_adset_ids=${encodeURIComponent(group.externalId)}`
            : undefined;
        return (
          <div key={group.id} className="rounded-xl border bg-background">
            <details className="group">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
                <ChevronDown className="size-4 text-muted-foreground group-open:rotate-180" />
                <h5 className="text-sm font-semibold">{group.name}</h5>
                <span className="text-xs text-muted-foreground">
                  {groupAds.length} {groupAds.length === 1 ? "ad" : "ads"}
                  {group.budget != null
                    ? ` · ${money(group.budget)}${group.budgetType === "daily" ? "/day" : " lifetime"}`
                    : ""}
                </span>
                {group.status && (
                  <span className="ml-auto text-xs text-muted-foreground capitalize">
                    {group.status}
                  </span>
                )}
                {targeting && (
                  <div className="w-full pl-7">
                    <DeliveryTargetingSummary compact audience={targeting} />
                  </div>
                )}
              </summary>
              <div className="space-y-4 px-4 pb-4">
                {pc.campaignId && pc.status !== "ended" && (
                  <MetaAdditions group={group} />
                )}
                {group.configuration?.platform === "meta_ads" &&
                  group.configuration.placements && (
                    <p className="text-xs text-muted-foreground">
                      Placements:{" "}
                      {group.configuration.placements
                        .map(
                          (id) =>
                            META_PLACEMENTS.find((p) => p.id === id)?.label ??
                            id,
                        )
                        .join(" · ")}
                    </p>
                  )}
                {!group.externalId && (
                  <p className="text-xs text-muted-foreground">
                    Internal draft · not yet created on Meta
                  </p>
                )}
                {!targeting && (
                  <p className="text-xs text-muted-foreground">
                    Targeting details unavailable.
                  </p>
                )}
                {setLink && (
                  <a
                    href={setLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block text-xs text-muted-foreground hover:underline"
                  >
                    Open ad set in Meta ↗
                  </a>
                )}
                {groupAds.map(renderAd)}
                {!groupAds.length && (
                  <p className="text-sm text-muted-foreground">
                    No delivered ads in this set.
                  </p>
                )}
              </div>
            </details>
            {seed && group.audienceId && (
              <div className="px-4 pb-4 pl-11">
                <SeedLookalikeStep
                  brandId={seed.brandId}
                  brandName={seed.brandName}
                  campaignAudienceId={group.audienceId}
                  display={group.externalId ? "row" : "section"}
                  seedContext={seed.context}
                  required={
                    audiences.find((a) => a.id === group.audienceId)?.type ===
                    "lookalike"
                  }
                />
              </div>
            )}
          </div>
        );
      })}
      {ungrouped.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Ad set unavailable</p>
          {ungrouped.map(renderAd)}
        </div>
      )}
      {!groups.length && !ads.length && (
        <p className="text-sm text-muted-foreground">
          No delivered ad sets or ads yet.
        </p>
      )}
    </section>
  );
}
