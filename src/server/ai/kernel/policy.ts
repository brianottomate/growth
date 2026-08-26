import "server-only";

import type {
  GROWTH_CAPABILITY_ACTIONS,
  GrowthCapabilityId,
} from "@/lib/growth-capabilities";

export type GrowthSurface =
  | "overview-chat"
  | "plan-chat"
  | "mcp"
  | "invoke-growth"
  | "test";
export type GrowthToolConsequence =
  | "local-read"
  | "provider-read"
  | "model-read"
  | "model-write"
  | "local-write"
  | "provider-write"
  | "background-run";

export interface GrowthActionPolicy {
  access: "organization-member";
  consequence: GrowthToolConsequence;
  approval: "none" | "user";
  idempotent: boolean;
  reversible: boolean;
  undoWith?: string;
  surfaces: readonly GrowthSurface[];
}

const ALL = ["overview-chat", "mcp", "invoke-growth", "test"] as const;
const PRODUCT = ["overview-chat", "plan-chat", "test"] as const;
// Provider-spend writes need the in-app approval card. The direct MCP
// projection executes tools without that continuation, so it cannot advertise
// these actions until the MCP route enforces an equivalent approval handshake.
const APPROVAL_PRODUCT = ["overview-chat", "test"] as const;
const PLAN_READ = [
  "overview-chat",
  "plan-chat",
  "mcp",
  "invoke-growth",
  "test",
] as const;
const read = (
  consequence: GrowthToolConsequence = "local-read",
  surfaces: readonly GrowthSurface[] = ALL,
): GrowthActionPolicy => ({
  access: "organization-member",
  consequence,
  approval: "none",
  idempotent: true,
  reversible: false,
  surfaces,
});
const write = (
  options: Partial<Omit<GrowthActionPolicy, "access">> = {},
): GrowthActionPolicy => ({
  access: "organization-member",
  consequence: options.consequence ?? "local-write",
  approval: options.approval ?? "none",
  idempotent: options.idempotent ?? false,
  reversible: options.reversible ?? true,
  surfaces: options.surfaces ?? ALL,
  ...(options.undoWith ? { undoWith: options.undoWith } : {}),
});

export const growthActionPolicies = {
  workspaceOverview: { overview: read() },
  navigateWorkspace: { navigate: read() },
  prepareProductionPacket: { prepare: write() },
  renderSocialPosts: { render: read() },
  // Delegates to the blog sub-agent, which writes DRAFTS in the production
  // CMS. provider-write because the effect lands in DatoCMS, not our DB;
  // not reversible from here because undo means editing in Dato.
  blogAgent: {
    run: write({ consequence: "provider-write", reversible: false }),
  },
  // Writes newsletter drafts through the product services. local-write
  // because the effect lands in our own tables, and revisions are kept, so
  // an edit can be restored rather than lost.
  newsletterAgent: { run: write({ consequence: "local-write" }) },
  brandRead: {
    list: read("local-read", PLAN_READ),
    getMap: read("local-read", PLAN_READ),
    next: read("local-read", PLAN_READ),
  },
  productAtlasRead: { list: read(), get: read() },
  productAtlasWrite: { create: write(), update: write({ idempotent: true }) },
  storefrontRead: { list: read(), get: read(), listReferences: read() },
  storefrontWrite: {
    create: write(),
    update: write({ idempotent: true }),
    markStale: write({ idempotent: true }),
    confirmCurrent: write({ idempotent: true }),
    assignManager: write({ idempotent: true }),
    copySiblingContent: write({ idempotent: true }),
    captureReference: write({
      consequence: "background-run",
      undoWith: "storefrontWrite.removeReference",
    }),
    removeReference: write({ reversible: false }),
  },
  audienceRead: { list: read() },
  audienceWrite: {
    createTarget: write(),
    saveTargets: write({ idempotent: true }),
    updateTarget: write({ idempotent: true }),
    updateActivation: write({ idempotent: true }),
  },
  researchRead: {
    search: read("provider-read", PRODUCT),
    readPage: read("provider-read", PRODUCT),
  },
  // PRODUCT, not ALL — same call as researchRead. An MCP host almost always
  // has its own Drive connector, and it is a better file search than this one;
  // duplicating it just widens Growth's surface. External callers resolve
  // their own file ids and hand them to contentMediaWrite.importFromDrive,
  // which still fetches the bytes server-side so they never cross the model.
  // The in-app chat has no such connector, so it keeps both actions.
  driveRead: {
    status: read("local-read", PRODUCT),
    browse: read("provider-read", PRODUCT),
  },
  contentRead: {
    pipeline: read(),
    upcoming: read(),
    productionQueue: read(),
    getWorkItem: read(),
    search: read(),
    suggestMedia: read("model-read"),
  },
  contentWrite: {
    createIdea: write(),
    updateWorkItem: write({ idempotent: true }),
    setFirstComment: write({ idempotent: true }),
    setThread: write({ idempotent: true }),
    addCrossPost: write(),
    createPlatformPost: write(),
    promotePlatformPost: write({ reversible: false }),
    // Creates a DRAFT in the external CMS; deletable there, never auto-published.
    publishBlogDraft: write({ consequence: "provider-write" }),
    // Real delete, no trash to restore from. Deliberate: drafts are cheap to
    // create here, so they should be cheap to remove, and an archive-only
    // workspace left the assistant reasoning about rows nobody would send.
    // Anything with a delivery record is refused in purge.service.
    deleteWorkItem: write({ reversible: false }),
  },
  contentMediaWrite: {
    attachChatImage: write({ idempotent: true }),
    attachLibraryMedia: write({ idempotent: true }),
    freezeComposition: write({ consequence: "provider-write" }),
    recoverArchiveMedia: write({ consequence: "provider-write" }),
    makeCarousel: write({ idempotent: true }),
    prepareUpload: write(),
    finishUpload: write({ idempotent: true }),
    importRemoteImages: write({ consequence: "provider-write" }),
    importFromDrive: write({ consequence: "provider-write" }),
  },
  emailRead: { get: read() },
  emailWrite: {
    createSlot: write(),
    createDigestFromRow: write(),
    setDigestImage: write({ idempotent: true }),
    createProductUpdate: write(),
    updateDraft: write({ idempotent: true }),
    generateDraft: write({ consequence: "background-run" }),
    deleteDraft: write({ reversible: false }),
  },
  contentStrategyRead: { get: read() },
  contentStrategyWrite: {
    savePillar: write({ idempotent: true }),
    saveSeries: write({ idempotent: true }),
    deleteSeries: write({ reversible: false }),
    // One series is cheap to rebuild; a whole shelf is not, so the bulk clear is
    // the one purge that stops for an explicit yes.
    clearSeries: write({ approval: "user", reversible: false }),
    organizeIdeas: write({ idempotent: true }),
    proposeGroupings: write({ consequence: "model-write" }),
    resolveGrouping: write({ idempotent: true }),
  },
  adsRead: {
    scope: read("provider-read"),
    top: read("provider-read"),
    listDestinations: read("provider-read"),
    diagnoseAlignment: read("model-read"),
    inspectConversions: read(),
  },
  adsWrite: {
    createMetaDraft: write({
      consequence: "provider-write",
      approval: "user",
      idempotent: true,
      reversible: false,
      surfaces: APPROVAL_PRODUCT,
    }),
    createGoogle: write({
      consequence: "provider-write",
      approval: "user",
      idempotent: true,
      reversible: false,
      surfaces: APPROVAL_PRODUCT,
    }),
    boostMetaPost: write({
      consequence: "provider-write",
      approval: "user",
      idempotent: true,
      reversible: false,
      surfaces: APPROVAL_PRODUCT,
    }),
    duplicateMetaCampaign: write({
      consequence: "provider-write",
      approval: "user",
      idempotent: false,
      reversible: false,
      surfaces: APPROVAL_PRODUCT,
    }),
  },
  publishingRead: {
    connections: read(),
    openTimelinePost: read(),
    // One model call over a date-bounded shortlist. Reads our own rows and
    // writes nothing, so the judgement is free to be wrong here.
    proposeLivePost: read("model-read"),
  },
  publishingWrite: {
    schedule: write({
      consequence: "provider-write",
      approval: "user",
      idempotent: true,
      reversible: false,
    }),
    publishNow: write({
      consequence: "provider-write",
      approval: "user",
      reversible: false,
    }),
    reschedule: write({
      consequence: "provider-write",
      approval: "user",
      idempotent: true,
      reversible: false,
    }),
    updateFirstComment: write({
      consequence: "provider-write",
      approval: "user",
      idempotent: true,
      reversible: false,
    }),
    // The odd one out in this group: nothing leaves the building. It writes
    // the receipt for a send that already happened elsewhere, so it is a
    // local-write, re-runnable, and undone by moving the spot's status back.
    recordExternalPublish: write({
      consequence: "local-write",
      idempotent: true,
      undoWith: "contentWrite.updateWorkItem",
    }),
    // Merges two rows into one and deletes the duplicate. The data survives on
    // the surviving row, but the row itself does not come back.
    applyLivePostMatch: write({
      consequence: "local-write",
      approval: "user",
      reversible: false,
    }),
  },
  sourceSyncWrite: {
    discoverChannels: write({
      consequence: "background-run",
      reversible: false,
    }),
    registerChannel: write(),
    scrapePosts: write({ consequence: "background-run", reversible: false }),
    syncOwnedContent: write({
      consequence: "background-run",
      reversible: false,
    }),
    syncWebsite: write({ consequence: "background-run", reversible: false }),
    syncBlog: write({ consequence: "background-run", reversible: false }),
  },
  mediaAnalysisRead: { list: read(), get: read() },
  mediaAnalysisWrite: {
    analyzeImage: write({ consequence: "model-write" }),
    prepareVideo: write({ consequence: "model-write" }),
  },
  mediaLibraryWrite: {
    // Promotion dedups by URL, so re-saving the same paste is a no-op; the
    // model-write consequence covers the auto-tag analysis pass.
    saveChatMedia: write({ idempotent: true, consequence: "model-write" }),
  },
  strategyRead: { getTargets: read(), proposeTargets: read("model-read") },
  strategyWrite: {
    createCadence: write(),
    updateCadence: write({ idempotent: true }),
    setSeriesCadence: write({ idempotent: true }),
    createBrandMix: write(),
    updateBrandMix: write({ idempotent: true }),
  },
  planningRead: {
    previewSlots: read("model-read", PLAN_READ),
    draftMomentBlueprint: read("model-read", PLAN_READ),
  },
  planningWrite: { generateSlots: write() },
  amplificationRead: { list: read() },
  amplificationWrite: {
    request: write({ idempotent: true }),
    notify: write({
      consequence: "provider-write",
      approval: "user",
      idempotent: true,
      reversible: false,
    }),
  },
  leadsRead: { summary: read(), sequence: read() },
  // Regenerating a draft is reversible (the prior draft is replaced, nothing
  // leaves Growth) but it does spend model tokens, so it is a write.
  leadsWrite: { rewriteSequence: write({ idempotent: false }) },
  lifecycleRead: {
    overview: read(),
    inspectProgram: read(),
    searchCampaigns: read(),
    findGaps: read(),
  },
  lifecycleWrite: {
    createProgram: write(),
    updateProgram: write({ idempotent: true }),
    addStep: write(),
    updateStep: write({ idempotent: true }),
    linkCampaign: write({ idempotent: true }),
    setCleanupStatus: write({ idempotent: true }),
    archiveProgram: write({ idempotent: true }),
    restoreProgram: write({ idempotent: true }),
  },
  listeningRead: { recent: read() },
} as const satisfies {
  [Capability in GrowthCapabilityId]: Record<
    (typeof GROWTH_CAPABILITY_ACTIONS)[Capability][number],
    GrowthActionPolicy
  >;
};

export function policyForGrowthTool(
  name: string,
  input?: unknown,
): GrowthActionPolicy {
  const policies = (
    growthActionPolicies as Record<string, Record<string, GrowthActionPolicy>>
  )[name];
  if (!policies)
    throw new Error(`Missing Growth capability policy for ${name}`);
  const action =
    typeof input === "object" &&
    input !== null &&
    "action" in input &&
    typeof input.action === "string"
      ? input.action
      : undefined;
  if (!action) return Object.values(policies)[0]!;
  const policy = policies[action];
  if (!policy)
    throw new Error(`Missing Growth action policy for ${name}.${action}`);
  return policy;
}

export function capabilityAllowsSurface(name: string, surface: GrowthSurface) {
  const policies = (
    growthActionPolicies as Record<string, Record<string, GrowthActionPolicy>>
  )[name];
  return Boolean(
    policies &&
    Object.values(policies).some((policy) => policy.surfaces.includes(surface)),
  );
}
