import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import Link from "next/link";
import type { ReactNode } from "react";
import { campaignDisplayName } from "@/lib/campaign-navigation";
import { cn } from "@/components/ui/lib/utils";

/** Shared campaign identity; each workspace owns the surrounding preview. */
export function CampaignSummary({
  name,
  href,
  detail,
  status,
  description,
  compact = false,
}: {
  name: string;
  href: string;
  detail?: ReactNode;
  status?: ReactNode;
  description?: string | null;
  compact?: boolean;
}) {
  return (
    <div className={cn("min-w-0", compact ? "space-y-0.5" : "space-y-2")}>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={href}
          title={name}
          className={cn(
            "min-w-0 font-semibold [overflow-wrap:anywhere] hover:underline",
            compact ? "block text-[13px] leading-snug" : "text-sm leading-snug",
          )}
        >
          {campaignDisplayName(name)}
        </Link>
        {typeof status === "string" ? (
          <span className="rounded-md border px-2 py-0.5 text-xs text-muted-foreground">
            {status}
          </span>
        ) : (
          status
        )}
      </div>
      {detail && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {detail}
        </p>
      )}
      {description && (
        <p className="line-clamp-2 max-w-3xl text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  );
}

function thumbnailSource(url: string) {
  if (!url.includes("/api/compositions/preview")) return url;
  return (
    new URLSearchParams(url.slice(url.indexOf("?") + 1)).get("sourceUrl") ?? url
  );
}

export function CampaignThumbnailStrip({
  urls,
  total,
  href,
}: {
  urls: string[];
  total: number;
  href: string;
}) {
  const sources = [...new Set(urls.map(thumbnailSource))].slice(0, 4);
  if (!sources.length) return null;
  return (
    <Link
      href={href}
      aria-label={`View ${total} campaign ads`}
      className="flex w-fit max-w-full flex-wrap items-center gap-1.5"
    >
      {sources.map((src) => (
        // oxlint-disable-next-line nextjs/no-img-element
        <img
          key={src}
          src={src}
          alt=""
          loading="lazy"
          className="size-12 shrink-0 rounded-lg border bg-muted object-cover"
        />
      ))}
      {total > sources.length && (
        <span className="pl-1 text-[11px] text-muted-foreground">
          +{total - sources.length}
        </span>
      )}
    </Link>
  );
}

/** Same platform identities in a dense row or an expanded initiative preview. */
export function CampaignPlatforms({
  platforms,
  expanded = false,
}: {
  platforms: { id: string; platform: string; status: string }[];
  expanded?: boolean;
}) {
  if (!platforms.length)
    return (
      <span className="text-xs text-muted-foreground">No platform yet</span>
    );
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {platforms.map((item) => (
        <span
          key={item.id}
          title={`${platformLabel(item.platform)} · ${item.status}`}
          className={cn(
            "inline-flex items-center gap-1.5",
            expanded && "rounded-md bg-muted/40 px-2 py-1",
          )}
        >
          <ChannelLogo platform={item.platform} className="size-3.5" />
          {expanded && `${platformLabel(item.platform)} · ${item.status}`}
        </span>
      ))}
    </span>
  );
}

/** Each row responds to its own width, including when nested in a client card. */
export function CampaignListRow({
  name,
  href,
  status,
  detail,
  description,
  thumbnails,
  platforms,
  spend,
  actions,
}: {
  name: string;
  href: string;
  status?: ReactNode;
  detail?: ReactNode;
  description?: string | null;
  thumbnails?: ReactNode;
  platforms?: ReactNode;
  spend?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="@container/campaign min-w-0">
      {/* Actions stay top right at every width; the name and description wrap
        beside them rather than pushing them below. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 px-4 py-4 @4xl/campaign:gap-6">
        <div className="min-w-0 space-y-3">
          <CampaignSummary
            compact
            name={name}
            href={href}
            status={status}
            detail={detail}
            description={description}
          />
          {thumbnails}
        </div>
        {(platforms || spend || actions) && (
          <div className="flex min-w-0 flex-col items-end gap-2">
            {actions && (
              <div className="flex flex-wrap items-center justify-end gap-1">
                {actions}
              </div>
            )}
            {(platforms || spend) && (
              <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2 text-xs text-muted-foreground">
                {platforms}
                {spend && <span className="whitespace-nowrap">{spend}</span>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
