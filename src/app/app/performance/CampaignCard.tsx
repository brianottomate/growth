import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { DeleteCampaignButton } from "@/app/app/brands/[brandSlug]/ads/_views/DeleteCampaignButton";
import type {
  DeskBrand,
  DeskCampaign,
} from "@/server/services/performance-desk.service";
import { campaignHref, SpendCell, StateChip } from "./_components";

/** Visual campaign summary; editing stays in the existing campaign workspace. */
export function CampaignCard({
  brand,
  campaign,
}: {
  brand: DeskBrand;
  campaign: DeskCampaign;
}) {
  const platformIds = campaign.platforms
    .filter((row) => row.status !== "draft")
    .map((row) => row.id);
  return (
    <article className="flex min-w-0 flex-col rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between gap-2">
        <StateChip state={campaign.state} />
        <DeleteCampaignButton
          campaignId={campaign.id}
          campaignName={campaign.name}
          brandSlug={brand.slug ?? brand.id}
          livePlatformCampaigns={platformIds.length}
          platformCampaignIds={platformIds}
          compact
          afterDelete="refresh"
        />
      </div>
      <h3 className="mt-3 text-sm font-semibold [overflow-wrap:anywhere]">
        <Link href={campaignHref(brand, campaign)} className="hover:underline">
          {campaign.name}
        </Link>
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Created{" "}
        {campaign.createdAt.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })}
      </p>
      {campaign.thumbs.length ? (
        <div className="mt-4 grid grid-cols-4 gap-2">
          {campaign.thumbs.slice(0, 4).map((src, index) => (
            <div
              key={`${src}-${index}`}
              className="aspect-square overflow-hidden rounded-lg border bg-muted"
            >
              {/* oxlint-disable-next-line nextjs/no-img-element */}
              <img
                src={src}
                alt=""
                loading="lazy"
                className="size-full object-cover"
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-lg border border-dashed p-5 text-center text-xs text-muted-foreground">
          No creative attached yet.
        </p>
      )}
      <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-4">
        <div>
          <p className="text-xs text-muted-foreground">Campaign ads</p>
          <p className="mt-1 text-sm font-semibold">
            {campaign.adCount} · {campaign.approvedCount} approved
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Spend / budget</p>
          <div className="mt-1">
            <SpendCell campaign={campaign} />
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {campaign.platforms.map((row) => (
          <span
            key={row.id}
            className="inline-flex items-center gap-2 rounded-lg border px-2 py-1 text-[11px]"
          >
            <ChannelLogo platform={row.platform} className="size-3.5" />
            {platformLabel(row.platform)} · {row.status}
          </span>
        ))}
        {!campaign.platforms.length ? (
          <p className="text-xs text-muted-foreground">No platform planned.</p>
        ) : null}
      </div>
      <Link
        href={campaignHref(brand, campaign)}
        className="mt-5 flex items-center justify-between border-t pt-3 text-xs font-medium"
      >
        Open campaign
        <ArrowRight className="size-3.5" />
      </Link>
    </article>
  );
}
