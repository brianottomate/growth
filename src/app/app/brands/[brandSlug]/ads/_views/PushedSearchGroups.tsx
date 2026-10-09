import { ChevronDown } from "lucide-react";
import type { PlatformAd, PlatformDeliveryGroup } from "@/server/db/ads-schema";
import { searchTerms } from "@/lib/search-terms";
import { SearchCopyPreview } from "./SearchCopyPreview";

/** Render delivered copy and its actual group relationship, not current draft ads. */
export function PushedSearchGroups({
  groups,
  ads,
  campaignHref = "",
}: {
  groups: PlatformDeliveryGroup[];
  ads: PlatformAd[];
  campaignHref?: string;
}) {
  const ungrouped = ads.filter(
    (ad) => !groups.some((group) => group.id === ad.platformDeliveryGroupId),
  );
  return (
    <section className="space-y-3">
      <h4 className="text-sm font-semibold">Ad groups · {groups.length}</h4>
      {groups.map((group) => {
        const groupAds = ads.filter(
          (ad) => ad.platformDeliveryGroupId === group.id,
        );
        const config = group.configuration;
        const keywords = searchTerms(
          config?.platform === "google_ads" ? config.keywords : null,
        );
        return (
          <details
            key={group.id}
            className="group rounded-xl border bg-background"
          >
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
              <ChevronDown className="size-4 shrink-0 text-muted-foreground group-open:rotate-180" />
              <h5 className="text-sm font-semibold">{group.name}</h5>
              <span className="text-xs text-muted-foreground">
                {keywords.length} keywords · {groupAds.length}{" "}
                {groupAds.length === 1 ? "ad" : "ads"}
              </span>
            </summary>
            <div className="space-y-4 px-4 pb-4">
              {keywords.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {keywords.map((term) => (
                    <span
                      key={`${term.match}:${term.text}`}
                      className="inline-flex max-w-full items-center gap-2 rounded-md bg-muted px-2.5 py-1.5"
                    >
                      <span className="text-xs break-words">{term.text}</span>
                      <span className="text-[10px] text-muted-foreground capitalize">
                        {term.match}
                      </span>
                    </span>
                  ))}
                </div>
              )}
              {groupAds.map((ad) => (
                <DeliveredSearchAd
                  key={ad.id}
                  ad={ad}
                  campaignHref={campaignHref}
                />
              ))}
            </div>
          </details>
        );
      })}
      {ungrouped.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Ad group unavailable</p>
          {ungrouped.map((ad) => (
            <DeliveredSearchAd
              key={ad.id}
              ad={ad}
              campaignHref={campaignHref}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function DeliveredSearchAd({
  ad,
  campaignHref,
}: {
  ad: PlatformAd;
  campaignHref: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium">
          {ad.name ?? ad.headline ?? "Search ad"}
        </span>
        {ad.manageUrl && (
          <a
            href={ad.manageUrl}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:underline"
          >
            Open in Google ↗
          </a>
        )}
      </div>
      <a
        href={ad.adId ? `${campaignHref}#ad-${ad.adId}` : undefined}
        aria-label={`View ${ad.name ?? "Search ad"} in campaign ads`}
        className="block rounded-xl hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <SearchCopyPreview
          copy={{
            headlines: ad.copy?.headlines ?? (ad.headline ? [ad.headline] : []),
            descriptions: ad.copy?.descriptions ?? (ad.body ? [ad.body] : []),
            linkUrl: ad.linkUrl ?? undefined,
          }}
          showAssets={false}
        />
      </a>
    </div>
  );
}
