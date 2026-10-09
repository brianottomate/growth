"use client";
import { GeographyChips } from "@/components/geography-chips";
import { DeliveryGroupEditor } from "./DeliveryGroupEditor";
import { hasDeliveryLocations } from "@/lib/platform-delivery";
import type { DeliveryGroupConfiguration } from "@/lib/platform-delivery";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/orpc/client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { ChannelLogo } from "@/components/channel-logos";
import { Button } from "@/components/ui/button";
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
import { PlatformAdSelection } from "./PlatformAdSelection";
import { PushToPlatform } from "./PushToPlatform";
import { DeletePlatformCampaign } from "./DeletePlatformCampaign";
import { AskAssistantButton } from "./AskAssistantButton";
import { money } from "./format";
import { ChevronDown } from "lucide-react";
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
  const [editingSetup, setEditingSetup] = useState(false);
  const studioHref = pathname.startsWith("/app/performance/")
    ? `/app/performance/clients/${encodeURIComponent(brandSlug)}/ads`
    : `/app/brands/${encodeURIComponent(brandSlug)}/ads`;
  const destinations = useQuery(
    orpc.ads.destinations.queryOptions({
      input: { brandSlug, platform: "google" },
    }),
  );
  const destinationRows = destinations.data?.destinations ?? [];
  const destination =
    destinationRows.length === 1 ? destinationRows[0] : undefined;
  const google = pc.settings?.google;
  const search = google?.campaignType === "search";
  const selected = selectPlatformAds(ads, "google_ads", pc.settings ?? {});
  const approved = selected.filter((ad) => ad.status === "approved");
  const groups = audiences;
  const groupCount = groups.length;
  const missingKeywords = groups.filter(
    (group) => !searchTerms(group.keywords).length,
  );
  const invalid = search
    ? approved.filter((ad) => !textAdReady(ad.content as AdTextContent))
    : [];
  const missingLink = approved.some(
    (ad) => !("linkUrl" in ad.content && ad.content.linkUrl) && !brandUrl,
  );
  const blockers = [
    !google?.goal && "Choose a goal in Edit setup.",
    destinations.isPending && "Loading the configured Google account.",
    destinations.error && "Could not load the configured Google account.",
    !destinations.isPending &&
      !destinations.error &&
      !destination &&
      "Configure one Google ad account for this brand in Settings.",
    !google?.campaignType && "Choose Search or Display in Google settings.",
    !hasDeliveryLocations(google?.geography) &&
      "Set campaign location targeting in Google settings.",
    !pc.budget && "Set a platform budget.",
    pc.budgetType === "lifetime" &&
      "Google requires a daily budget. Change it in Edit setup.",
    !approved.length && "Add and approve at least one included ad.",
    search && !groupCount && "Add at least one ad group with keywords.",
    search &&
      missingKeywords.length > 0 &&
      `Add keywords to ${missingKeywords.map((group) => group.name).join(", ")}.`,
    invalid.length > 0 &&
      "Fix the headline and description limits on included search ads.",
    missingLink && "Set the campaign website or an ad destination URL.",
    pc.budgetType === "lifetime" &&
      !(pc.endAt ?? campaignEndAt) &&
      "Set the flight end date in Edit setup.",
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
          <Button
            size="sm"
            variant="outline"
            onClick={() => setEditingSetup(!editingSetup)}
            aria-expanded={editingSetup}
          >
            {editingSetup ? "Cancel" : "Edit setup"}
          </Button>
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
            <span title={blockers.join("\n")}>
              <Button size="sm" disabled>
                Push to Google
              </Button>
            </span>
          ) : (
            <PushToPlatform
              campaignId={campaignId}
              brandSlug={brandSlug}
              platform="google_ads"
              draftAdCount={approved.length}
              audienceCount={groupCount}
              budget={pc.budget}
              budgetType={pc.budgetType}
              configuration={
                destination && google?.goal
                  ? {
                      connectionAccountId: destination.connectionAccountId,
                      adAccountId: destination.adAccountId,
                      goal: google.goal,
                      label:
                        destination.adAccountName ?? destination.adAccountId,
                    }
                  : undefined
              }
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
        </div>
        {!editingSetup && (
          <dl className="grid grid-cols-1 gap-4 @sm:grid-cols-2 @2xl:grid-cols-4">
            <Fact
              label="Campaign type"
              value={
                google?.campaignType
                  ? search
                    ? "Search"
                    : "Display"
                  : "Not set"
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
            <Fact
              label="Ad account"
              value={
                destination
                  ? `${destination.adAccountName ?? "Google Ads"} · ${destination.adAccountId}`
                  : destinations.isPending
                    ? "Loading…"
                    : "Not configured"
              }
            />
            <Fact label="Goal" value={google?.goal ?? "Not set"} />
            <Fact label="Website" value={brandUrl ?? "Not set"} />
            <Fact
              label="Flight ends"
              value={
                (pc.endAt ?? campaignEndAt)
                  ? new Date((pc.endAt ?? campaignEndAt)!).toLocaleDateString(
                      "en-US",
                      {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        timeZone: "UTC",
                      },
                    )
                  : "Not set"
              }
            />
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Locations</dt>
              <dd className="mt-1 space-y-1.5">
                <GeographyChips
                  label="Cities"
                  values={google?.geography?.cities}
                />
                <GeographyChips
                  label="States"
                  values={google?.geography?.states}
                />
                <GeographyChips
                  label="Regions"
                  values={google?.geography?.regions}
                />
                <GeographyChips
                  label="Countries"
                  values={google?.geography?.countries}
                />
                {!hasDeliveryLocations(google?.geography) && (
                  <span className="text-sm font-semibold">Not configured</span>
                )}
              </dd>
            </div>
          </dl>
        )}
        {editingSetup && (
          <div className="space-y-4">
            <GoogleSettings
              platformCampaignId={pc.id}
              config={google}
              budget={pc.budget}
              budgetType={pc.budgetType}
              endAt={pc.endAt ?? campaignEndAt}
              compact
              defaultOpen
              onClose={() => setEditingSetup(false)}
            />
          </div>
        )}
      </section>
      {!search && <PlatformAdSelection pc={pc} ads={ads} />}
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
          </div>
          <p className="text-xs text-muted-foreground">
            {groupCount} groups · {groupCount * approved.length} ready ads. Ads
            are currently shared across groups.
          </p>
          {search && !!google?.negativeKeywords?.length && (
            <details className="group text-xs">
              <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
                <ChevronDown className="size-3.5 text-muted-foreground transition-transform group-open:rotate-180" />
                <span>
                  Negative keywords ·{" "}
                  {searchTerms(google.negativeKeywords).length}
                </span>
                <span className="text-muted-foreground">
                  Applies to all groups
                </span>
              </summary>
              <div className="mt-2 flex flex-wrap gap-2">
                {google.negativeKeywords.map((keyword) => (
                  <span key={keyword} className="rounded-md bg-muted px-2 py-1">
                    {keyword}
                  </span>
                ))}
              </div>
            </details>
          )}
          {groups.map((group) => (
            <section
              key={group.id}
              className="relative rounded-lg border bg-background"
              aria-label={`Ad group: ${group.name}`}
            >
              <div className="absolute top-4 right-4">
                <DeliveryGroupEditor group={group}>
                  <section className="space-y-3 border-t pt-4">
                    <h4 className="text-sm font-medium">Ads</h4>
                    <p className="text-xs text-muted-foreground">
                      Applies to all Google groups. Ad selection saves
                      immediately.
                    </p>
                    <PlatformAdSelection pc={pc} ads={ads} compact />
                  </section>
                </DeliveryGroupEditor>
              </div>
              <details className="group/ad-group">
                <summary className="flex min-h-16 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 p-4 pr-24 [&::-webkit-details-marker]:hidden">
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open/ad-group:rotate-180" />
                  <h5 className="min-w-0 text-sm font-semibold">
                    {group.name}
                  </h5>
                  <span className="text-xs text-muted-foreground">
                    {searchTerms(group.keywords).length} keywords ·{" "}
                    {selected.length} {selected.length === 1 ? "ad" : "ads"}
                  </span>
                </summary>
                <div className="space-y-5 px-4 pb-4">
                  <div className="space-y-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      Keywords
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {searchTerms(group.keywords).map((term) => (
                        <span
                          key={`${term.match}:${term.text}`}
                          className="inline-flex max-w-full items-center gap-2 rounded-md bg-muted px-2.5 py-1.5"
                        >
                          <span className="text-xs break-words">
                            {term.text}
                          </span>
                          <span className="shrink-0 text-[10px] text-muted-foreground capitalize">
                            {term.match}
                          </span>
                        </span>
                      ))}
                    </div>
                    {"excludedKeywords" in group &&
                    group.excludedKeywords?.length ? (
                      <p className="text-xs text-muted-foreground">
                        Excluded: {group.excludedKeywords.join(", ")}
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      {selected.length === 1 ? "Ad" : "Ads"}
                    </p>
                    {selected.map((ad) => (
                      <div key={ad.id} className="space-y-2">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="min-w-0 flex-1 font-medium">
                            {ad.name}
                          </span>
                          {ad.status !== "approved" && (
                            <span className="shrink-0 text-muted-foreground">
                              Awaiting approval
                            </span>
                          )}
                        </div>
                        <a
                          href={`#ad-${ad.id}`}
                          aria-label={`View ${ad.name} in campaign ads`}
                          className="block rounded-xl transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          <SearchCopyPreview
                            copy={ad.content as AdTextContent}
                            showAssets={false}
                          />
                        </a>
                      </div>
                    ))}
                    {!selected.length && (
                      <p className="text-xs text-muted-foreground">
                        No ads selected. Choose a campaign Search ad using Edit.
                      </p>
                    )}
                  </div>
                </div>
              </details>
            </section>
          ))}
        </section>
      )}
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
