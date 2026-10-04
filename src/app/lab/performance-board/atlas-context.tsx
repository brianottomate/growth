import type { ProductAtlas } from "@/lib/product-atlas";

// Borrow Atlas concepts for this independent, code-backed planning board.
// These are draft relationships, not persisted Product Atlas records.
type JourneyContext = {
  job: ProductAtlas["jobs"][number];
  views: ProductAtlas["views"];
};

const CONTEXT: Record<string, JourneyContext> = {
  sales: {
    job: {
      id: "pitch-qualified-lead",
      name: "Turn an applicable lead into a signed client",
    },
    views: [
      {
        id: "prospects",
        surfaceId: "growth-web",
        name: "Prospects",
        reference: { kind: "route", value: "/app/performance/prospects" },
      },
      {
        id: "pitch",
        surfaceId: "growth-web",
        name: "Pitch workspace",
        reference: {
          kind: "route",
          value: "/app/performance/clients/{slug}/pitch",
        },
      },
    ],
  },
  setup: {
    job: {
      id: "prepare-brand",
      name: "Make a brand ready for creative production",
    },
    views: [
      {
        id: "setup",
        surfaceId: "growth-web",
        name: "Setup",
        reference: {
          kind: "route",
          value: "/app/performance/clients/{slug}/setup",
        },
      },
    ],
  },
  wanderos: {
    job: {
      id: "prepare-homes-and-destinations",
      name: "Prepare home inventory, featured homes, destinations and booking targets",
    },
    views: [
      {
        id: "wanderos",
        surfaceId: "growth-web",
        name: "WanderOS",
        reference: {
          kind: "route",
          value: "/app/performance/clients/{slug}/wanderos",
        },
      },
      {
        id: "connection-settings",
        surfaceId: "growth-web",
        name: "Connection & sync settings",
        reference: {
          kind: "route",
          value: "/app/performance/clients/{slug}/settings#wanderos",
        },
      },
    ],
  },
  catalog: {
    job: {
      id: "produce-catalog",
      name: "Produce Meta catalog cards and catalog ad copy",
    },
    views: [
      {
        id: "catalog",
        surfaceId: "growth-web",
        name: "Catalog",
        reference: {
          kind: "route",
          value: "/app/performance/clients/{slug}/catalog",
        },
      },
      {
        id: "studio",
        surfaceId: "growth-web",
        name: "Ad studio",
        reference: {
          kind: "route",
          value: "/app/performance/clients/{slug}/ads",
        },
      },
    ],
  },
  campaigns: {
    job: {
      id: "launch-campaign",
      name: "Turn prepared creative into a reviewed campaign and live delivery",
    },
    views: [
      {
        id: "campaigns",
        surfaceId: "growth-web",
        name: "Client campaigns",
        reference: {
          kind: "route",
          value: "/app/performance/clients/{slug}/campaigns",
        },
      },
      {
        id: "all-campaigns",
        surfaceId: "growth-web",
        name: "Across clients",
        reference: { kind: "route", value: "/app/performance/campaigns" },
      },
    ],
  },
  studio: {
    job: {
      id: "produce-regular-ads",
      name: "Create and review regular ad creative for campaign delivery",
    },
    views: [
      {
        id: "ad-studio",
        surfaceId: "growth-web",
        name: "Ad studio",
        reference: {
          kind: "route",
          value: "/app/performance/clients/{slug}/ads",
        },
      },
    ],
  },
  email: {
    job: {
      id: "email-lifecycle",
      name: "Reach guests through email and ongoing lifecycle journeys",
    },
    views: [
      {
        id: "client-email",
        surfaceId: "growth-web",
        name: "Client email",
        reference: {
          kind: "route",
          value: "/app/performance/clients/{slug}/newsletters",
        },
      },
      {
        id: "newsletters",
        surfaceId: "growth-web",
        name: "Newsletters",
        reference: { kind: "route", value: "/app/newsletters" },
      },
      {
        id: "lifecycle",
        surfaceId: "growth-web",
        name: "Lifecycle",
        reference: { kind: "route", value: "/app/lifecycle" },
      },
    ],
  },
};

export function AtlasContext({
  journey,
  slug,
}: {
  journey: string;
  slug: string;
}) {
  const context = CONTEXT[journey];
  if (!context) return null;
  return (
    <div className="mt-3 space-y-3 rounded-xl border bg-muted/30 p-3">
      <div>
        <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
          Job to accomplish
        </p>
        <p className="mt-1 font-medium">{context.job.name}</p>
      </div>
      <div>
        <p className="mb-2 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
          Supporting views
        </p>
        <div className="flex flex-wrap gap-1.5">
          {context.views.map((view) => (
            <a
              key={view.id}
              href={view.reference!.value.replace(
                "{slug}",
                encodeURIComponent(slug),
              )}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border bg-background px-2 py-1 text-xs hover:bg-accent"
            >
              {view.name} ↗
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
