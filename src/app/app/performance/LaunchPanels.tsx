import Link from "next/link";
import { PersonasClient } from "@/app/app/audiences/PersonasClient";
import { Layers3, MapPinned } from "lucide-react";

import type {
  WorkspaceCampaign,
  WorkspaceData,
  WorkspaceHome,
} from "./launch-workspace";

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

const panel = "rounded-xl border bg-card p-5";

const STATE_LABEL: Record<WorkspaceCampaign["state"], string> = {
  draft: "Draft",
  pushed: "Pushed to platform",
  live: "Live",
  ended: "Ended",
};

export function LaunchBrief({ data }: { data: WorkspaceData }) {
  return (
    <div className="grid grid-cols-1 gap-4 @4xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <div className="grid grid-cols-1 overflow-hidden rounded-xl border bg-card @xl:grid-cols-2 @5xl:grid-cols-3">
          {[
            [
              "Campaign budget",
              data.budget.total != null ? money(data.budget.total) : "Not set",
            ],
            [
              "Spend to date",
              data.budget.spend != null ? money(data.budget.spend) : "$0",
            ],
            ["Delivery stage", data.brand.deliveryLabel],
          ].map(([label, value]) => (
            <div
              key={label}
              className="border-b p-4 last:border-b-0 @xl:border-r @xl:last:border-r-0"
            >
              <p className="text-[11px] text-muted-foreground">{label}</p>
              <p className="mt-1 font-semibold">{value}</p>
            </div>
          ))}
        </div>
        <section className={panel}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">
              {data.startingSource === "ads"
                ? "Starting properties"
                : "Properties to consider"}{" "}
              · {data.starting.length}
            </h3>
            <Link
              href={`/app/performance/brands/${data.brand.slug}/ads?view=preview`}
              className="text-xs font-medium hover:underline"
            >
              Preview properties & creative →
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">
            {data.startingSource === "ads"
              ? "Properties used in this brand’s ads."
              : "Feed previews. No properties are linked to ads yet."}
          </p>
          {data.starting.length === 0 ? (
            <p className="mt-4 text-xs text-muted-foreground">
              No property photos available yet.
            </p>
          ) : null}
          <div className="mt-4 grid grid-cols-1 gap-3 @xl:grid-cols-3">
            {data.starting.map((home) => (
              <HomeThumb key={home.id} home={home} />
            ))}
          </div>
        </section>
        <CampaignPanel
          campaigns={data.campaigns}
          adCount={data.campaigns.reduce(
            (sum, campaign) => sum + campaign.adCount,
            0,
          )}
          compact
          brandSlug={data.brand.slug}
        />
      </div>
      <div className="space-y-4">
        <AudienceSummary brand={data.brand} />
        <section className={panel}>
          <h3 className="font-semibold">Launch workspace</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Build and review in the tools below.
          </p>
          <nav aria-label="Launch workspace" className="mt-4 divide-y">
            {[
              {
                label: "Homes & booking targets",
                tab: "booking",
                detail: `${data.homes.length} homes with photos`,
              },
              {
                label: "Ad studio",
                tab: "ads",
                detail: `${data.adCount} ad ideas outside campaigns`,
              },
              {
                label: "Campaign build",
                tab: "campaigns",
                detail: `${data.campaigns.length} campaigns`,
              },
              {
                label: "Catalog",
                tab: "catalog",
                detail: "Templates, previews and exports",
              },
            ].map((item) => (
              <Link
                key={item.tab}
                href={`/app/performance/brands/${data.brand.slug}/${item.tab}`}
                className="block py-3 first:pt-0 last:pb-0"
              >
                <span className="text-xs font-medium hover:underline">
                  {item.label} →
                </span>
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  {item.detail}
                </span>
              </Link>
            ))}
          </nav>
        </section>
      </div>
    </div>
  );
}

function HomeThumb({ home }: { home: WorkspaceHome }) {
  return (
    <div>
      <div className="relative aspect-[16/9] overflow-hidden rounded-lg bg-muted">
        {/* oxlint-disable-next-line nextjs/no-img-element */}
        <img
          src={home.thumbUrl ?? home.imageUrl}
          alt=""
          loading="lazy"
          className="size-full object-cover"
        />
      </div>
      <p className="mt-2 truncate text-sm font-semibold">{home.name}</p>
      <p className="truncate text-xs text-muted-foreground">
        {[
          home.bedrooms ? `${home.bedrooms} bd` : null,
          home.guests ? `${home.guests} guests` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </div>
  );
}

/** Personas and their guest origins share one source and one editor. */
function AudienceSummary({ brand }: { brand: WorkspaceData["brand"] }) {
  return (
    <aside className={`${panel} self-start`}>
      <div className="mb-4 flex items-center gap-2">
        <MapPinned className="size-4" />
        <h3 className="font-semibold">Audience</h3>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Who we’re reaching and where they come from.
      </p>
      <PersonasClient
        brands={[{ id: brand.id, name: brand.name }]}
        embedded
        launchBrief
        brandSlug={brand.slug}
      />
    </aside>
  );
}

export function AudiencePanel({ brand }: { brand: WorkspaceData["brand"] }) {
  return <AudienceSummary brand={brand} />;
}

export function CampaignPanel({
  campaigns,
  adCount,
  compact = false,
  brandSlug,
}: {
  campaigns: WorkspaceCampaign[];
  adCount: number;
  compact?: boolean;
  brandSlug?: string;
}) {
  return (
    <section className={panel}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Layers3 className="size-4" />
          <h3 className="font-semibold">Campaign structure</h3>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
          {adCount} campaign ads
        </span>
      </div>
      {brandSlug ? (
        <Link
          href={`/app/performance/brands/${brandSlug}/campaigns`}
          className="mt-3 inline-block text-xs font-medium hover:underline"
        >
          Manage campaigns →
        </Link>
      ) : null}
      {campaigns.length === 0 ? (
        <p className="mt-5 rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
          No campaign yet. Ads live on the wall until one is created.
        </p>
      ) : (
        <div className="mt-5 space-y-4 text-sm">
          {campaigns.map((campaign) => (
            <div key={campaign.id}>
              <p className="font-semibold break-all">
                {brandSlug ? (
                  <Link
                    href={`/app/performance/brands/${brandSlug}/campaigns/${campaign.id}`}
                    className="hover:underline"
                  >
                    {campaign.name}
                  </Link>
                ) : (
                  campaign.name
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {STATE_LABEL[campaign.state]}
                {campaign.budget ? ` · $${campaign.budget} budget` : ""}
                {campaign.spend ? ` · $${campaign.spend} spent` : ""} ·{" "}
                {campaign.adCount} ads
              </p>
              {!compact && campaign.platforms.length > 0 ? (
                <div className="mt-2 ml-4 flex flex-wrap gap-1.5 border-l pl-4">
                  {campaign.platforms.map((platform, index) => (
                    <span
                      key={`${campaign.id}-${index}`}
                      className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                    >
                      {platform.platform} · {platform.status}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
