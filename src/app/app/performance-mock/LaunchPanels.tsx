import { CheckCircle2, Image, Layers3, MapPinned, Target } from "lucide-react";

import { ORIGINS, PROPERTIES } from "./data";

const panel = "rounded-xl border bg-card p-5";

export function LaunchBrief() {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <div className="grid overflow-hidden rounded-xl border bg-card sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Demo media budget", "$1,500 / 30 days"],
            ["Demo daily budget", "$50 at ad-set level"],
            ["Objective", "Direct bookings"],
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
          <h3 className="font-semibold">Client-selected starting properties</h3>
          <p className="text-xs text-muted-foreground">
            Not the full fictional portfolio.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {PROPERTIES.map((property) => (
              <div key={property.id}>
                <div
                  className={`aspect-[16/9] rounded-lg bg-gradient-to-br ${property.palette} p-3`}
                >
                  <span className="rounded bg-black/60 px-2 py-1 text-[10px] font-semibold text-white">
                    ILLUSTRATIVE
                  </span>
                </div>
                <p className="mt-2 text-sm font-semibold">{property.name}</p>
                <p className="text-xs text-muted-foreground">
                  {property.facts}
                </p>
                <p className="mt-2 flex items-center gap-1 text-[11px] text-emerald-600">
                  <CheckCircle2 className="size-3" />
                  Creative &amp; copy ready
                </p>
              </div>
            ))}
          </div>
        </section>
        <CampaignPanel compact />
      </div>
      <AudienceSummary />
    </div>
  );
}

function AudienceSummary() {
  return (
    <aside className={panel}>
      <div className="flex items-center gap-2">
        <MapPinned className="size-4" />
        <h3 className="font-semibold">Guest-origin audience</h3>
      </div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        Same-city matching within the travel market only · trailing 12 months of
        confirmed bookings
      </p>
      <div className="mt-4 space-y-3">
        {ORIGINS.map(([state, count]) => (
          <div
            key={state}
            className="grid grid-cols-[75px_1fr_24px] items-center gap-2 text-xs"
          >
            <span>{state}</span>
            <span className="h-1.5 rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-foreground"
                style={{ width: `${(count / 46) * 100}%` }}
              />
            </span>
            <span className="text-right tabular-nums">{count}</span>
          </div>
        ))}
      </div>
      <div className="mt-5 border-t pt-4 text-xs">
        <strong>184 aggregate bookings · 172 mapped · 12 unmapped</strong>
        <p className="mt-1 text-muted-foreground">
          Visible date window: Sep 17, 2025–Sep 16, 2026 · 93% mapped coverage
        </p>
      </div>
      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        Aggregate counts only. No guest lists or PII. No interests. No
        lookalikes. No nationwide fallback.
      </p>
    </aside>
  );
}

export function AudiencePanel() {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className={panel}>
        <div className="flex items-center gap-2">
          <Target className="size-5" />
          <div>
            <h3 className="font-semibold">
              Guest-origin coverage across all represented US states
            </h3>
            <p className="text-xs leading-5 text-muted-foreground">
              Same-city matching within the Scottsdale travel market only, using
              the trailing 12 months of confirmed bookings.
            </p>
          </div>
        </div>
        <dl className="mt-5 grid gap-3 rounded-xl border bg-muted/20 p-4 text-xs sm:grid-cols-2">
          <div>
            <dt className="font-semibold">Matching rule</dt>
            <dd className="mt-1 leading-5 text-muted-foreground">
              Same-city matching within the travel market only. No nationwide
              fallback.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Source and date window</dt>
            <dd className="mt-1 leading-5 text-muted-foreground">
              Trailing 12 months of confirmed bookings: Sep 17, 2025–Sep 16,
              2026.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Mapped and unmapped coverage</dt>
            <dd className="mt-1 leading-5 text-muted-foreground">
              Aggregate guest-origin counts across all represented US states:
              172 mapped and 12 unmapped of 184 total.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Explicit exclusions</dt>
            <dd className="mt-1 leading-5 text-muted-foreground">
              No guest lists or PII. No interests. No lookalikes.
            </dd>
          </div>
        </dl>
        <div
          className="mt-6 grid min-h-64 grid-cols-6 gap-2 rounded-xl bg-muted/30 p-5 sm:grid-cols-9"
          aria-label="Mapped state coverage visualization"
        >
          {["WA", "CA", "AZ", "CO", "TX", "IL"].map((state, index) => (
            <span
              key={state}
              className="flex aspect-square items-center justify-center rounded-lg border border-sky-500/30 bg-sky-500/10 text-xs font-semibold"
              style={{
                gridColumnStart: [2, 1, 2, 4, 5, 7][index],
                gridRowStart: [1, 3, 4, 3, 5, 2][index],
              }}
            >
              {state}
              <span className="sr-only"> included</span>
            </span>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-sky-500/10 px-3 py-1 text-sky-600">
            6 represented states mapped
          </span>
          <span className="rounded-full bg-muted px-3 py-1">
            No nationwide fallback
          </span>
        </div>
      </section>
      <AudienceSummary />
    </div>
  );
}

export function CampaignPanel({ compact = false }: { compact?: boolean }) {
  return (
    <section className={panel}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Layers3 className="size-4" />
          <h3 className="font-semibold">Campaign structure</h3>
        </div>
        <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-600">
          Build complete
        </span>
      </div>
      <div className="mt-5 space-y-4 text-sm">
        <div>
          <p className="font-semibold break-all">
            DEMO_PERF_DESERT_HOUSE_SALES_PURCHASE
          </p>
          <p className="text-xs text-muted-foreground">
            Campaign · Sales / Purchase · fictional
          </p>
        </div>
        <div className="ml-4 border-l pl-5">
          <p className="font-semibold">BROAD_CA+TX+AZ+CO+WA+IL</p>
          <p className="text-xs text-muted-foreground">
            One broad ad set · $50 demo/day · 6 origin states
          </p>
          <div className="mt-4 ml-3 border-l pl-5">
            <p className="flex items-center gap-2 font-semibold">
              <Image className="size-4" />6 property ads
            </p>
            <p className="text-xs text-muted-foreground">
              Static + carousel for each of 3 starting properties · 24
              illustrative assets
            </p>
          </div>
        </div>
      </div>
      {!compact ? (
        <>
          <div className="mt-5 grid gap-2 border-t pt-4 text-xs sm:grid-cols-3">
            {[
              "Demo ad account check complete",
              "Simulated purchase tracking check",
              "Illustrative links reviewed",
            ].map((item) => (
              <p
                key={item}
                className="flex items-center gap-1 text-emerald-600"
              >
                <CheckCircle2 className="size-3" />
                {item}
              </p>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            No spend starts until Brooke completes QA in Meta, enables the
            campaign, and moves it to Live.
          </p>
        </>
      ) : null}
    </section>
  );
}
