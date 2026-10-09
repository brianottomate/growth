"use client";
import { DeliveryCoverage } from "./DeliveryCoverage";
import { DeliveryGroupEditor } from "./DeliveryGroupEditor";
import { hasDeliveryLocations } from "@/lib/platform-delivery";
import type { DeliveryGroupConfiguration } from "@/lib/platform-delivery";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChannelLogo } from "@/components/channel-logos";
import { Button } from "@/components/ui/button";
import { eligiblePlatformAds } from "@/lib/platform-ad-plan";
import type { DeliveryGeography } from "@/server/db/ads-schema";
import { selectPlatformAds } from "@/lib/platform-ad-plan";
import { textAdReady } from "@/lib/ad-authoring";
import { searchTerms } from "@/lib/search-terms";
import type {
  Ad,
  AdTextContent,
  PlatformCampaign,
} from "@/server/db/ads-schema";
import { GoogleSettings } from "./GoogleSettings";
import { PlatformBudget } from "./PlatformBudget";
import { PlatformAdSelection } from "./PlatformAdSelection";
import { PushToPlatform } from "./PushToPlatform";
import { DeletePlatformCampaign } from "./DeletePlatformCampaign";
import { WriteSearchAdsButton } from "./WriteSearchAdsButton";
import { AskAssistantButton } from "./AskAssistantButton";
import { money } from "./format";
import { SearchCopyPreview } from "./SearchCopyPreview";

type Audience = {
  configuration?: DeliveryGroupConfiguration | null;
  id: string;
  name: string;
  geography?: DeliveryGeography | null;
  ageMin?: number | null;
  ageMax?: number | null;
  keywords?: string[] | null;
  excludedKeywords?: string[] | null;
};

export function GooglePlatformCard({
  pc,
  ads,
  previewAds = [],
  audiences,
  campaignId,
  campaignName,
  brandSlug,
  brandName,
  brandUrl,
  campaignEndAt,
}: {
  pc: PlatformCampaign;
  ads: Ad[];
  previewAds?: Ad[];
  audiences: Audience[];
  campaignId: string;
  campaignName: string;
  brandSlug: string;
  brandName: string;
  brandUrl: string | null;
  campaignEndAt?: Date | null;
}) {
  const pathname = usePathname();
  const studioHref = pathname.startsWith("/app/performance/")
    ? `/app/performance/clients/${encodeURIComponent(brandSlug)}/ads`
    : `/app/brands/${encodeURIComponent(brandSlug)}/ads`;
  const google = pc.settings?.google;
  const search = google?.campaignType === "search";
  const selected = selectPlatformAds(ads, "google_ads", pc.settings ?? {});
  const previews = eligiblePlatformAds(
    previewAds,
    "google_ads",
    pc.settings ?? {},
  );
  const approved = selected.filter((ad) => ad.status === "approved");
  const groups = audiences;
  const groupCount =
    (search
      ? groups.filter((a) => searchTerms(a.keywords).length > 0).length
      : groups.length) ||
    (search ? (searchTerms(google?.keywords).length ? 1 : 0) : 1);
  const invalid = search
    ? approved.filter((ad) => !textAdReady(ad.content as AdTextContent))
    : [];
  const missingLink = approved.some(
    (ad) => !("linkUrl" in ad.content && ad.content.linkUrl) && !brandUrl,
  );
  const blockers = [
    !google?.campaignType && "Choose Search or Display in Google settings.",
    !hasDeliveryLocations(google?.geography) &&
      "Set campaign location targeting in Google settings.",
    !pc.budget && "Set a platform budget.",
    !approved.length && "Add and approve at least one included ad.",
    search &&
      !groupCount &&
      "Add keywords to an ad group or set fallback keywords.",
    invalid.length > 0 &&
      "Fix the headline and description limits on included search ads.",
    missingLink && "Set the campaign website or an ad destination URL.",
    pc.budgetType === "lifetime" &&
      !(pc.endAt ?? campaignEndAt) &&
      "A lifetime budget needs an end date.",
    !search &&
      approved.some(
        (ad) => !("media" in ad.content) || !ad.content.media[0]?.url,
      ) &&
      "Add an image to every included Display ad.",
  ].filter((value): value is string => typeof value === "string");
  return (
    <section
      id="platform-google_ads"
      className="@container min-w-0 scroll-mt-4 space-y-5 rounded-xl border bg-card p-5"
    >
      <div className="flex flex-wrap items-center gap-3">
        <ChannelLogo platform="google_ads" className="size-5" />
        <h3 className="font-semibold">Google Ads</h3>
        <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
          Planned · paused on push
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <AskAssistantButton
            brandId={pc.brandId}
            brandName={brandName}
            campaignId={campaignId}
            campaignName={campaignName}
            focus="platforms"
            label="Shape"
            ask={`Help me shape the Google plan for “${campaignName}”. Read its ads, ad-group keywords and Google settings before changing anything.`}
          />
          {blockers.length ? (
            <Button size="sm" disabled>
              Push to Google
            </Button>
          ) : (
            <PushToPlatform
              campaignId={campaignId}
              brandSlug={brandSlug}
              platform="google_ads"
              draftAdCount={approved.length}
              audienceCount={groupCount}
              budget={pc.budget}
              budgetType={pc.budgetType}
            />
          )}
          <DeletePlatformCampaign
            platformCampaignId={pc.id}
            campaignName="Google Ads"
            brandSlug={brandSlug}
            isLive={false}
            spend={pc.spend}
            hasExternalId={Boolean(pc.externalId)}
            compact
            afterDelete="refresh"
          />
        </div>
      </div>
      <section className="space-y-3" aria-label="Delivery setup">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="text-sm font-medium">Delivery setup</h4>
          <div className="flex flex-wrap gap-2">
            <PlatformBudget
              platformCampaignId={pc.id}
              budget={pc.budget}
              budgetType={pc.budgetType}
            />
            <GoogleSettings
              platformCampaignId={pc.id}
              config={google}
              brandSlug={brandSlug}
              brandUrl={brandUrl}
              compact
            />
          </div>
        </div>
        <dl className="grid grid-cols-1 gap-4 @sm:grid-cols-2 @2xl:grid-cols-4">
          <Fact
            label="Campaign type"
            value={
              google?.campaignType ? (search ? "Search" : "Display") : "Not set"
            }
          />
          <Fact
            label="Budget"
            value={
              pc.budget
                ? `${money(pc.budget)}${pc.budgetType === "lifetime" ? " lifetime" : " / day"}`
                : "Not set"
            }
          />
          <Fact label="Website" value={brandUrl ?? "Not set"} />
          <Fact
            label="Campaign negatives"
            value={String(searchTerms(google?.negativeKeywords).length)}
          />
        </dl>
      </section>
      <DeliveryCoverage
        targets={[
          { id: pc.id, name: "Google campaign", geography: google?.geography },
        ]}
      />
      <PlatformAdSelection pc={pc} ads={ads} />
      {!approved.length && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <Button size="sm" variant="outline" asChild>
            <Link href={studioHref}>Review drafts in Studio</Link>
          </Button>
          <p>Approve the copy in Studio, then add it to this campaign.</p>
        </div>
      )}
      {search && (
        <section
          className="space-y-3 border-t pt-4"
          aria-label="Search ad groups"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-medium">Ad groups · {groupCount}</h4>
            <WriteSearchAdsButton campaignId={campaignId} />
          </div>
          <p className="text-xs text-muted-foreground">
            Each configured delivery group becomes a Google ad group. Every
            included, approved text ad runs in each group. Google combines the
            supplied headlines and descriptions.
          </p>
          {groups.map((group) => (
            <details key={group.id} className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                {group.name} · {searchTerms(group.keywords).length} keywords ·{" "}
                {approved.length} approved ad{approved.length === 1 ? "" : "s"}
                {previews.length
                  ? ` · ${previews.length} draft preview${previews.length === 1 ? "" : "s"}`
                  : ""}
              </summary>
              <div className="mt-3 space-y-2 text-xs">
                <div className="flex flex-wrap gap-2">
                  {searchTerms(group.keywords).map((term) => (
                    <span
                      key={`${term.match}:${term.text}`}
                      className="inline-flex max-w-full items-center gap-2 rounded-md border bg-background px-2.5 py-1.5"
                    >
                      <span className="text-sm break-words">{term.text}</span>
                      <span className="shrink-0 text-[10px] font-medium text-muted-foreground capitalize">
                        {term.match}
                      </span>
                    </span>
                  ))}
                </div>

                <DeliveryGroupEditor group={group} />
                {group.excludedKeywords?.length ? (
                  <p>Excluded: {group.excludedKeywords.join(", ")}</p>
                ) : null}
              </div>
            </details>
          ))}
          {!groups.length && !!groupCount && (
            <p className="rounded-lg border p-3 text-xs whitespace-pre-line">
              Fallback ad group{"\n"}
              {google?.keywords?.join("\n")}
            </p>
          )}
          {audiences.length > groups.length && groups.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {audiences.length - groups.length} ad groups without keywords are
              left out of Search.
            </p>
          )}
          {[...approved, ...previews].map((ad) => {
            const copy = ad.content as AdTextContent;
            return (
              <details key={ad.id} className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm">
                  {ad.name}
                  {previews.some((row) => row.id === ad.id)
                    ? " · Studio draft"
                    : " · Approved"}{" "}
                  · {copy.headlines.length} headlines /{" "}
                  {copy.descriptions.length} descriptions
                </summary>
                <div className="mt-3">
                  <SearchCopyPreview copy={copy} />
                </div>
              </details>
            );
          })}
          {!!google?.negativeKeywords?.length && (
            <details className="text-xs">
              <summary className="cursor-pointer">
                Campaign negative keywords
              </summary>
              <p className="mt-2 whitespace-pre-line">
                {google.negativeKeywords.join("\n")}
              </p>
            </details>
          )}
        </section>
      )}
      {!!blockers.length && (
        <div
          className="space-y-1 text-sm text-muted-foreground"
          aria-label="Required before pushing"
        >
          <p className="font-medium">To finish setup</p>
          <ul className="list-disc pl-5">
            {blockers.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}
      {previews.length > 0 && (
        <p className="text-xs text-muted-foreground">
          After approval and assignment: {groupCount} ad groups ×{" "}
          {previews.length} Studio ideas = {groupCount * previews.length}{" "}
          additional planned Google ads.
        </p>
      )}
      <p className="border-t pt-4 text-xs text-muted-foreground">
        {groupCount} ad groups × {approved.length} approved ad
        {approved.length === 1 ? "" : "s"} = {groupCount * approved.length}{" "}
        Google ads. Choose the connected ad account when pushing. Launch is a
        separate action.
      </p>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-semibold break-words">{value}</dd>
    </div>
  );
}
