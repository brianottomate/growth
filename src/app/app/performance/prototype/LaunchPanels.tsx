import { GeographyChips as Chips } from "@/components/geography-chips";
import { Layers3, MapPinned } from "lucide-react";

import type {
  WorkspaceCampaign,
  WorkspaceData,
  WorkspaceHome,
  WorkspacePersona,
} from "./ClientWorkspace";

const panel = "rounded-xl border bg-card p-5";

const STATE_LABEL: Record<WorkspaceCampaign["state"], string> = {
  draft: "Draft",
  pushed: "In Meta (pushed)",
  live: "Live",
  ended: "Ended",
};

export function LaunchBrief({ data }: { data: WorkspaceData }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <div className="grid overflow-hidden rounded-xl border bg-card sm:grid-cols-2 xl:grid-cols-4">
          {[
            [
              "Media budget",
              data.budget.monthly ? `$${data.budget.monthly} / mo` : "Not set",
            ],
            [
              "Spend to date",
              data.budget.spend != null ? `$${data.budget.spend}` : "$0",
            ],
            ["Delivery stage", data.brand.deliveryLabel],
            ["Launch owner", "Brooke · final QA"],
          ].map(([label, value]) => (
            <div
              key={label}
              className="border-b p-4 last:border-b-0 sm:border-r sm:last:border-r-0"
            >
              <p className="text-[11px] text-muted-foreground">{label}</p>
              <p className="mt-1 font-semibold">{value}</p>
            </div>
          ))}
        </div>
        <section className={panel}>
          <h3 className="font-semibold">
            Starting properties · {data.starting.length}
          </h3>
          <p className="text-xs text-muted-foreground">
            The homes the ad set is keyed on, from this brand&apos;s feed.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {data.starting.map((home) => (
              <HomeThumb key={home.id} home={home} />
            ))}
          </div>
        </section>
        <CampaignPanel
          campaigns={data.campaigns}
          adCount={data.adCount}
          compact
        />
      </div>
      <AudienceSummary personas={data.personas} />
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

function hasDemand(persona: WorkspacePersona) {
  const g = persona.demandGeography;
  return Boolean(
    g &&
    (g.states?.length ||
      g.cities?.length ||
      g.countries?.length ||
      g.regions?.length),
  );
}

/** The demand geography read off the brand's personas, the reusable source. */
function AudienceSummary({ personas }: { personas: WorkspacePersona[] }) {
  const withDemand = personas.filter(hasDemand);
  return (
    <aside className={panel}>
      <div className="flex items-center gap-2">
        <MapPinned className="size-4" />
        <h3 className="font-semibold">Guest-origin audience</h3>
      </div>
      {withDemand.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed p-4 text-xs leading-5 text-muted-foreground">
          No persona carries a demand geography yet. Set it on a persona (in
          chat, or the persona editor) and it shows here.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {withDemand.map((persona) => (
            <div key={persona.id} className="space-y-1.5">
              <p className="text-xs font-semibold">{persona.name}</p>
              <Chips label="States" values={persona.demandGeography?.states} />
              <Chips label="Cities" values={persona.demandGeography?.cities} />
              <Chips
                label="Countries"
                values={persona.demandGeography?.countries}
              />
              {persona.demandGeography?.source ? (
                <p className="text-[10.5px] text-muted-foreground">
                  Source: {persona.demandGeography.source}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}

export function AudiencePanel({
  personas,
  brandSlug,
}: {
  marketCity: string | null;
  personas: WorkspacePersona[];
  brandSlug: string;
}) {
  const withDemand = personas.filter(hasDemand);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className={panel}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold">Guest-origin coverage</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              The demand geography on this brand&apos;s personas: where the
              guests we want come from. A campaign audience derives from it.
            </p>
          </div>
          <a
            href={`/app/brands/${brandSlug}`}
            className="shrink-0 text-[11.5px] text-sky-300 hover:underline"
          >
            Edit personas
          </a>
        </div>
        {withDemand.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed bg-muted/20 p-6 text-center text-xs text-muted-foreground">
            <p className="font-medium text-foreground">
              No demand geography yet
            </p>
            <p className="mx-auto mt-2 max-w-md leading-5">
              Personas now hold a structured demand geography (states, cities,
              countries, regions). Fill it from an agent&apos;s reasoning or a
              pasted lookup and it renders here. A live bookings-warehouse feed
              can replace the manual step later.
            </p>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {withDemand.map((persona) => (
              <div key={persona.id} className="rounded-xl border p-4">
                <p className="text-sm font-semibold">{persona.name}</p>
                <div className="mt-2 space-y-1.5">
                  <Chips
                    label="States"
                    values={persona.demandGeography?.states}
                  />
                  <Chips
                    label="Cities"
                    values={persona.demandGeography?.cities}
                  />
                  <Chips
                    label="Countries"
                    values={persona.demandGeography?.countries}
                  />
                  <Chips
                    label="Regions"
                    values={persona.demandGeography?.regions}
                  />
                </div>
                {persona.demandGeography?.source ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Source: {persona.demandGeography.source}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
      <AudienceSummary personas={personas} />
    </div>
  );
}

export function CampaignPanel({
  campaigns,
  adCount,
  compact = false,
}: {
  campaigns: WorkspaceCampaign[];
  adCount: number;
  compact?: boolean;
}) {
  return (
    <section className={panel}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Layers3 className="size-4" />
          <h3 className="font-semibold">Campaign structure</h3>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
          {adCount} ads drafted
        </span>
      </div>
      {campaigns.length === 0 ? (
        <p className="mt-5 rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
          No campaign yet. Ads live on the wall until one is created.
        </p>
      ) : (
        <div className="mt-5 space-y-4 text-sm">
          {campaigns.map((campaign) => (
            <div key={campaign.id}>
              <p className="font-semibold break-all">{campaign.name}</p>
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
