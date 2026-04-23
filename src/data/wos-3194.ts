// ─── WOS-3194: Search shows impossible-to-book dates ─────
//
// Visual map of the call chain from frontend → search microservice.
// Highlights the gap: property stay rules (min_nights, max_nights,
// gap_min_nights, lead_time_min_nights, allowed_checkin_days) exist
// in `properties_availability` but are never consumed by the search
// pipeline. The Typesense unit document has no stayRules field;
// availability service returns only bitmaps; no filter stage evaluates
// rules.
//
// Full writeup: ~/Developer/wander/wos-3194-search-stay-rules.md

export type NodeKind =
  | "frontend"
  | "gateway"
  | "pipeline"
  | "data"
  | "service"
  | "result"
  | "proposed";

export type NodeStatus =
  | "ok"          // working as intended
  | "gap"         // the bug lives here
  | "unused"      // data exists but isn't consumed
  | "proposed"    // proposed by the fix, does not exist yet
  | "symptom";    // downstream consequence

export interface FlowNode {
  id: string;
  label: string;
  description?: string;
  kind: NodeKind;
  status: NodeStatus;
  stage: 1 | 2 | 3 | 4 | 5;
  /** repo/file for the detail panel */
  path?: string;
  /** longer explanation surfaced on click */
  note?: string;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type?: "call" | "data" | "missing" | "proposed";
}

// ─── Colors ─────────────────────────────────────────────

export const KIND_COLORS: Record<NodeKind, string> = {
  frontend: "#3b82f6",   // blue
  gateway: "#64748b",    // slate
  pipeline: "#f59e0b",   // amber
  data: "#8b5cf6",       // violet
  service: "#06b6d4",    // cyan
  result: "#10b981",     // emerald
  proposed: "#22c55e",   // green
};

export const STATUS_COLORS: Record<NodeStatus, string> = {
  ok: "#64748b",         // slate — neutral
  gap: "#ef4444",        // red — the bug
  unused: "#a855f7",     // purple — data exists, not consumed
  proposed: "#22c55e",   // green — fix proposal
  symptom: "#f97316",    // orange — downstream consequence
};

export const STATUS_LABELS: Record<NodeStatus, string> = {
  ok: "Working",
  gap: "Bug location",
  unused: "Data exists, not consumed",
  proposed: "Proposed fix",
  symptom: "Downstream symptom",
};

export const STAGE_LABELS: Record<number, string> = {
  1: "1. Frontend",
  2: "2. Monolith (gateway)",
  3: "3. Search microservice",
  4: "4. Data sources",
  5: "5. Outcome",
};

export const STAGE_COLORS: Record<number, string> = {
  1: "#3b82f6",
  2: "#64748b",
  3: "#06b6d4",
  4: "#8b5cf6",
  5: "#10b981",
};

// ─── Stage 1: Frontend ──────────────────────────────────

const STAGE_1: FlowNode[] = [
  {
    id: "fe-web",
    label: "wander.com",
    description: "Next.js 16, searchQueryResults.ts",
    kind: "frontend",
    status: "ok",
    stage: 1,
    path: "wander.com/src/app/[...page]/_components/Search/searchQueryResults.ts",
    note: "Calls clientApi.POST('/guest-api/search'). Builds STRICT filter from checkIn/checkOut params — the common path.",
  },
  {
    id: "fe-mobile",
    label: "app.wander.com / mobile",
    description: "mobile app, same API",
    kind: "frontend",
    status: "ok",
    stage: 1,
    note: "Bug reported on mobile; reproduces identically on web. Not a client-side issue.",
  },
  {
    id: "fe-utils",
    label: "searchParamsToFilters",
    description: "Builds request body, sets expand:true",
    kind: "frontend",
    status: "ok",
    stage: 1,
    path: "wander.com/src/features/properties/components/Search/utils.ts",
    note: "STRICT vs RELATIVE branching on gapInDays. Sets expand:true when `location` is present → triggers monolith auto-expand fallback.",
  },
];

// ─── Stage 2: Monolith (API gateway) ────────────────────

const STAGE_2: FlowNode[] = [
  {
    id: "mono-route",
    label: "/guest-api/search",
    description: "v4.api.wander.com, Fastify",
    kind: "gateway",
    status: "ok",
    stage: 2,
    path: "wander/services/api/...",
    note: "Queue handler dispatched via module.registerHandlers. Routes to searchOnWander.",
  },
  {
    id: "mono-entry",
    label: "searchOnWander",
    description: "Orchestration entrypoint",
    kind: "gateway",
    status: "ok",
    stage: 2,
    path: "wander/src/growth/search/module/src/logic/search/entrypoint.ts",
    note: "Maps input → ServiceFilters, invokes search client, handles auto-expand, tracks analytics.",
  },
  {
    id: "mono-mapper",
    label: "mapSearchFiltersInputToServiceFilters",
    description: "Forwards only USER minNights (not property)",
    kind: "gateway",
    status: "gap",
    stage: 2,
    path: "wander/src/growth/search/module/src/integrations/search/mapper/filters.ts",
    note: "Passes `date.minNights` from the user's RelativeDateFilter preference. The property's own minimum is nowhere in the request pipeline because it isn't in the filter schema at all.",
  },
  {
    id: "mono-autoexpand",
    label: "auto-expand (bbox +100km)",
    description: "shouldAutoExpandServiceSearch",
    kind: "gateway",
    status: "ok",
    stage: 2,
    path: "wander/src/growth/search/module/src/logic/search/auto-expand.ts",
    note: "Runs a second search with expanded bbox if results < MIN_RESULTS_SMART_LOCATION and page=1. Does NOT alter date or rule filtering — not the source of the bug, but it widens the surface.",
  },
  {
    id: "mono-client",
    label: "@wander/search client",
    description: "openapi-fetch, undici pool",
    kind: "gateway",
    status: "ok",
    stage: 2,
    path: "wander/packages/systems/search/src/client.ts",
    note: "Typed HTTP client calling SYSTEM_SEARCH_API_URL. Types come from @wandercom/search-client (generated from search service openapi.json).",
  },
];

// ─── Stage 3: Search microservice ───────────────────────

const STAGE_3: FlowNode[] = [
  {
    id: "svc-route",
    label: "POST /collections/:id/search",
    description: "Deno + URLPattern router",
    kind: "service",
    status: "ok",
    stage: 3,
    path: "search/src/routes/search-units.ts",
    note: "Validates body against SearchFiltersSchema, invokes federatedSearch.",
  },
  {
    id: "svc-1-fetch",
    label: "1. fetch-all-ids",
    description: "Typesense text/bbox/facet query",
    kind: "pipeline",
    status: "ok",
    stage: 3,
    path: "search/src/logic/federated-search/1_fetch-all-ids.ts",
    note: "Uses `include_fields` to return only _uuid. Fix (Path A) extends this to also include the new stayRules block.",
  },
  {
    id: "svc-2-price",
    label: "2. filter-by-pricing",
    description: "Pricing service, if priceRange",
    kind: "pipeline",
    status: "ok",
    stage: 3,
    path: "search/src/logic/federated-search/2_filter-by-pricing.ts",
    note: "Skipped when no priceRange filter. No effect on this bug.",
  },
  {
    id: "svc-3-avail",
    label: "3. filter-by-availability",
    description: "Bitmap only — STRICT ignores minNights",
    kind: "pipeline",
    status: "gap",
    stage: 3,
    path: "search/src/logic/federated-search/3_filter-by-availability.ts",
    note: "Calls fetchBitmaps (availability service /calendar/bulk), then isUnitAvailable(bitmap, filter, start). For STRICT: just slice.includes('1'). For RELATIVE: uses filter.minNights (user's preference). Never consults the property's own minimum.",
  },
  {
    id: "svc-3b-rules",
    label: "[NEW] 3b. filter-by-stay-rules",
    description: "Evaluates property rules per filter type",
    kind: "proposed",
    status: "proposed",
    stage: 3,
    path: "search/src/logic/federated-search/3b_filter-by-stay-rules.ts",
    note: "New stage between availability (3) and hydrate (4). Reads stayRules carried through from stage 1, rejects units whose min/max/gap/lead-time/check-in-day constraints are violated by the requested date filter. Same tracing pattern as sibling stages.",
  },
  {
    id: "svc-4-hydrate",
    label: "4. hydrate",
    description: "Typesense document fetch, page slice",
    kind: "pipeline",
    status: "ok",
    stage: 3,
    path: "search/src/logic/federated-search/4_hydrate.ts",
    note: "Fetches the paged unit documents. `bookable` field here is a static property flag from the indexed document — it is NOT a per-query check.",
  },
];

// ─── Stage 4: Data sources ──────────────────────────────

const STAGE_4: FlowNode[] = [
  {
    id: "ts-unit",
    label: "Typesense unit document",
    description: "No stayRules field indexed",
    kind: "data",
    status: "gap",
    stage: 4,
    path: "search/src/logic/unit/_collection.ts, search/src/schemas/unit-document.ts",
    note: "Unit collection schema has no minNights/maxNights/gapMinNights/leadTimeMinNights/allowedCheckinDays. SearchUnit.bookable is a static listing flag only.",
  },
  {
    id: "avail-svc",
    label: "availability service",
    description: "/calendar/bulk — bitmaps only",
    kind: "service",
    status: "ok",
    stage: 4,
    path: "wandercom/availability",
    note: "Returns {unitId: calendars[]} — just 0/1 per day. Zero grep hits for min_night / gap_min / lead_time anywhere in its source. Correctly scoped; we don't need to change it.",
  },
  {
    id: "prop-db",
    label: "properties_availability",
    description: "min_nights, max_nights, gap_min_nights, lead_time_min_nights, allowed_checkin_days",
    kind: "data",
    status: "unused",
    stage: 4,
    path: "wander monolith Prisma + wandercom/property/services/property/src/dao/availability.ts",
    note: "Source of truth for all stay rules. Read by booking-create (which is why checkout rejects). Never read by the search ingestion path — that's the missing join.",
  },
  {
    id: "prop-policy",
    label: "property.policies (min_nights)",
    description: "Policy table, possible inheritance",
    kind: "data",
    status: "unused",
    stage: 4,
    path: "wandercom/property/services/property/src/dao/policies.ts",
    note: "Parallel min_nights at policy level. Open question: does the unit inherit when pa.min_nights is null? Booking-create already resolves this — the indexer needs to match that resolution.",
  },
];

// ─── Stage 5: Outcome ───────────────────────────────────

const STAGE_5: FlowNode[] = [
  {
    id: "result-bookable",
    label: "SearchUnit: bookable: true",
    description: "Shown to user as bookable card",
    kind: "result",
    status: "gap",
    stage: 5,
    note: "Live API returns bookable:true for 40/40 nationwide results, STRICT May 22-25. Stat test: 1163 total US results, 0 bookable:false. Impossible if stay rules were enforced given WanderOS portfolio.",
  },
  {
    id: "result-pdp",
    label: "PDP: user clicks Book",
    description: "User navigates to property page",
    kind: "result",
    status: "symptom",
    stage: 5,
    note: "PDP happily shows the property; calendar renders based on raw availability which matches the search result.",
  },
  {
    id: "result-checkout",
    label: "Checkout: Cannot create booking",
    description: "Booking-create rejects based on stay rules",
    kind: "result",
    status: "symptom",
    stage: 5,
    note: "Downstream enforcement works correctly — rejects because the 30-night minimum (or other rule) is violated. User churns.",
  },
];

export const NODES: FlowNode[] = [
  ...STAGE_1,
  ...STAGE_2,
  ...STAGE_3,
  ...STAGE_4,
  ...STAGE_5,
];

// ─── Edges ──────────────────────────────────────────────

export const EDGES: FlowEdge[] = [
  // Stage 1 → 2
  { id: "e-web-utils", source: "fe-web", target: "fe-utils", type: "call" },
  { id: "e-mobile-utils", source: "fe-mobile", target: "fe-utils", type: "call" },
  { id: "e-utils-route", source: "fe-utils", target: "mono-route", label: "POST /guest-api/search", type: "call" },

  // Stage 2 internal
  { id: "e-route-entry", source: "mono-route", target: "mono-entry", type: "call" },
  { id: "e-entry-mapper", source: "mono-entry", target: "mono-mapper", type: "call" },
  { id: "e-mapper-client", source: "mono-mapper", target: "mono-client", label: "ServiceFilters", type: "data" },
  { id: "e-entry-autoexpand", source: "mono-entry", target: "mono-autoexpand", label: "if total < MIN", type: "call" },
  { id: "e-autoexpand-client", source: "mono-autoexpand", target: "mono-client", label: "expanded bbox", type: "call" },

  // Stage 2 → 3
  { id: "e-client-svc", source: "mono-client", target: "svc-route", label: "HTTP", type: "call" },

  // Stage 3 internal (pipeline)
  { id: "e-svc-1", source: "svc-route", target: "svc-1-fetch", type: "call" },
  { id: "e-1-2", source: "svc-1-fetch", target: "svc-2-price", type: "call" },
  { id: "e-2-3", source: "svc-2-price", target: "svc-3-avail", type: "call" },
  { id: "e-3-4", source: "svc-3-avail", target: "svc-4-hydrate", type: "call" },

  // Proposed new stage
  { id: "e-3-3b", source: "svc-3-avail", target: "svc-3b-rules", label: "[NEW]", type: "proposed" },
  { id: "e-3b-4", source: "svc-3b-rules", target: "svc-4-hydrate", label: "[NEW]", type: "proposed" },

  // Stage 3 → Stage 4 (data sources)
  { id: "e-1-ts", source: "svc-1-fetch", target: "ts-unit", label: "query", type: "data" },
  { id: "e-4-ts", source: "svc-4-hydrate", target: "ts-unit", label: "hydrate", type: "data" },
  { id: "e-3-avail", source: "svc-3-avail", target: "avail-svc", label: "/calendar/bulk", type: "data" },
  { id: "e-3b-ts", source: "svc-3b-rules", target: "ts-unit", label: "[NEW] reads stayRules", type: "proposed" },

  // Unused data source (the gap)
  { id: "e-propdb-unused", source: "prop-db", target: "ts-unit", label: "NOT INDEXED", type: "missing" },
  { id: "e-policy-unused", source: "prop-policy", target: "prop-db", label: "inheritance?", type: "missing" },

  // Stage 3 → Stage 5 (outcome)
  { id: "e-4-result", source: "svc-4-hydrate", target: "result-bookable", label: "response", type: "data" },
  { id: "e-result-pdp", source: "result-bookable", target: "result-pdp", label: "user clicks", type: "call" },
  { id: "e-pdp-checkout", source: "result-pdp", target: "result-checkout", label: "user books", type: "call" },

  // Cross-link: properties_availability IS read at checkout (which is why booking-create rejects)
  { id: "e-checkout-propdb", source: "prop-db", target: "result-checkout", label: "booking-create reads this", type: "data" },
];
