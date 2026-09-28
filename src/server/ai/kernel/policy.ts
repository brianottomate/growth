import "server-only";

import { growthOperation } from "@/lib/growth-capabilities";

import type {
  GROWTH_CAPABILITY_ACTIONS,
  GrowthCapabilityId,
} from "@/lib/growth-capabilities";

export type GrowthSurface = "overview-chat" | "mcp" | "invoke-growth" | "test";
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
const PRODUCT = ["overview-chat", "test"] as const;
// Provider-spend writes need the in-app approval card. The direct MCP
// projection executes tools without that continuation, so it cannot advertise
// these actions until the MCP route enforces an equivalent approval handshake.
const APPROVAL_PRODUCT = ["overview-chat", "test"] as const;
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
  operationRead: { status: read() },
  workspaceOverview: { overview: read() },
  navigateWorkspace: { navigate: read() },
  prepareProductionPacket: { prepare: write() },
  renderSocialPosts: { render: read() },
  presentNextOptions: { present: read() },
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
    list: read("local-read", ALL),
    getMap: read("local-read", ALL),
    next: read("local-read", ALL),
  },
  brandWrite: {
    create: write(),
    // Idempotent on the lead's domain: a second call returns the brand the
    // first one made rather than a duplicate with a suffixed slug.
    createProspect: write({ idempotent: true }),
    setRelationship: write({
      idempotent: true,
      undoWith: "brandWrite.setRelationship",
    }),
    // Re-running refreshes the same fields from the same site.
    enrich: write({ idempotent: true }),
    // Renders three tones into our own library and points the brand at them;
    // the model-write consequence covers the lockup critique.
    setMark: write({ idempotent: true, consequence: "model-write" }),
    // The model picks among rendered candidates; re-running may pick another.
    suggestMark: write({ consequence: "model-write" }),
    // A reference onto the brand row; the card already exists in the library.
    addAdPreview: write({ idempotent: true }),
    // A merge into the brand's settings JSONB; the same patch twice is a no-op.
    setPerformanceSettings: write({ idempotent: true }),
    // Plain brand fields; writing the old values back is the undo.
    update: write({ idempotent: true, undoWith: "brandWrite.update" }),
    // Writes the story from one model call; undo by writing the old text back.
    draftStory: write({
      consequence: "model-write",
      undoWith: "brandWrite.update",
    }),
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
  personaRead: { list: read() },
  performanceRead: {
    list: read(),
    get: read(),
    searchAttachableCampaigns: read(),
    sponsoredAbandonment: read(),
    clientCampaignContext: read(),
    featuredHomes: read(),
    // BigQuery reads plus one look at the shortlist's hero photos.
    suggestFeaturedHomes: read("model-read"),
    // Renders cards onto sheets and asks one model call; writes nothing.
    reviewPortfolio: read("model-read"),
    intakes: read(),
    previewIntakeApply: read(),
  },
  // Commercial bookkeeping in our own tables. `attach` tags existing delivery
  // rows with a cycle id (undo = attach with cycleId null); nothing here
  // touches a provider or spends.
  performanceWrite: {
    createAccount: write(),
    updateAccount: write({ idempotent: true }),
    addProperty: write(),
    updateProperty: write({ idempotent: true }),
    openCycle: write(),
    updateCycle: write({ idempotent: true }),
    attach: write({
      idempotent: true,
      undoWith: "performanceWrite.attach",
    }),
    // Derived from campaign rows already in our DB; safe to re-run.
    refreshSpend: write({ idempotent: true }),
    // The signature. Re-running keeps the original signing date, so it is safe
    // to repeat and cannot move a contract date by accident.
    promoteToClient: write({ idempotent: true }),
    // Writes the client's own answers into the records that own each fact.
    // Refuses a second run on the same intake, because re-applying would
    // reopen a cycle an operator may have since corrected. It sets the
    // month's media budget, so chat asks with the approval card.
    applyIntake: write({ approval: "user", surfaces: APPROVAL_PRODUCT }),
    // Reads Zernio and stamps our own verification columns. No provider
    // mutation and no spend; re-running just re-checks.
    verifyIntakeAccess: write({ idempotent: true }),
    // Reads Zernio and upserts our own mirror rows. No provider mutation and
    // no spend, so it needs no approval, but it is a background-weight call.
    syncCampaigns: write({
      consequence: "background-run",
      idempotent: true,
    }),
    // Sets `featured` or the hero photo on one of our own home rows. Setting
    // the old value back is the undo.
    updateHome: write({
      idempotent: true,
      undoWith: "performanceWrite.updateHome",
    }),
  },
  personaWrite: {
    create: write(),
    update: write({ idempotent: true }),
    delete: write({ reversible: true }),
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
    readDocument: read("provider-read", PRODUCT),
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
    // A render and a vision pass; nothing is saved.
    directComposition: read("model-read", PRODUCT),
    // A copy pass over known facts; nothing is saved.
    writeCopy: read("model-read", PRODUCT),
    // Gemini paints the photo out to the canvas; the result is a library asset.
    extendComposition: write({ idempotent: true, consequence: "model-write" }),
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
    openCampaign: read(),
    listCampaigns: read(),
    ideaHomePhotos: read(),
    ideaContext: read(),
    catalogHomeFacts: read(),
    // Reading can ingest a home new since the last read, so it has a row.
    catalogState: read(),
    catalogWriteStatus: read(),
    suggestCampaignAudiences: read("model-read"),
    // Renders via Meta's preview API; creates nothing.
    previewAd: read("provider-read"),
    diagnoseAlignment: read("model-read"),
    inspectConversions: read(),
  },
  adsWrite: {
    // Local DB rows only; no provider call, no spend. Push is separate.
    draftCampaign: write(),
    draftAd: write(),
    // Writes every ad in the set and one model call for the captions. Local
    // rows only, no provider call; re-running replaces the last set rather
    // than stacking a second one, which is why it is idempotent.
    buildAdSet: write({ idempotent: true, consequence: "model-write" }),
    // Rewrites headline and caption on drawn ads from one model call.
    writeSetCopy: write({ idempotent: true, consequence: "model-write" }),
    // Several model calls per home; lands unapproved drafts only.
    generateStarterIdeas: write({ consequence: "model-write" }),
    // Approval is the person's sign-off that gates the push, so chat asks
    // for it with the approval card rather than deciding on its own.
    setAdStatus: write({
      idempotent: true,
      approval: "user",
      surfaces: APPROVAL_PRODUCT,
    }),
    setAdCopy: write({ idempotent: true }),
    saveIdea: write(),
    // Shells, bindings and cards: local ad rows, no provider call.
    addAdShell: write(),
    createAdsFromAssets: write(),
    setAdHome: write({ idempotent: true }),
    setHomeHero: write({ idempotent: true }),
    editCatalogCard: write({ idempotent: true }),
    // Catalog: local home rows and our own R2 renders, no provider call.
    refreshCatalogHomes: write({ idempotent: true }),
    newCatalogCopy: write({ consequence: "model-write" }),
    newCatalogPhoto: write({ consequence: "model-write" }),
    // Open cards only (never approved ones); a running run is returned, not doubled.
    writeCatalogCards: write({
      consequence: "background-run",
      idempotent: true,
    }),
    // The export ships only approved cards, so approval is the operator's.
    setCatalogApproval: write({
      idempotent: true,
      approval: "user",
      surfaces: APPROVAL_PRODUCT,
    }),
    setCatalogIncluded: write({ idempotent: true }),
    setCatalogDefaultTemplate: write({ idempotent: true }),
    setCatalogFormat: write({ idempotent: true }),
    exportCatalog: write({ consequence: "background-run" }),
    editAdCards: write(),
    // Sets one field on local rows; the push is still the provider step.
    attachAdSet: write({ idempotent: true }),
    // Swaps one card slot on a local draft for a library asset.
    replaceAdCard: write({ idempotent: true }),
    // One cell of one ad: local rows only, no provider call. Freezing marks a
    // cell decided (and derives a story crop into our own R2); it does not push.
    setPlacementCopy: write({ idempotent: true }),
    clearPlacement: write({ idempotent: true }),
    freezePlacement: write({ idempotent: true }),
    unfreezePlacement: write({ idempotent: true }),
    addAudience: write(),
    updateAudience: write({ idempotent: true }),
    planPlatform: write({ idempotent: true }),
    setCreativePool: write({ idempotent: true }),
    setPlatformDraft: write({ idempotent: true }),
    attachCampaign: write({ idempotent: true }),
    importMetaCampaign: write({ idempotent: true }),
    // Reads the provider's audiences; writes only Growth's mirror rows and
    // changes nothing on the ad account.
    pullPlatformAudiences: write({
      consequence: "provider-read",
      idempotent: true,
    }),
    linkAudience: write({ idempotent: true }),
    // Downloads from the platform CDN into R2; dedupes by source url.
    importCreative: write({ idempotent: true, reversible: true }),
    // Draft deletes drop local rows and are refused once the thing exists on
    // a platform, so they cannot destroy anything a provider knows about.
    deleteCampaignDraft: write({ reversible: false }),
    deleteAudience: write({ reversible: false }),
    deleteAdDraft: write({ reversible: false }),
    // Creates the campaign tree PAUSED, so approving the push does not start
    // spend — setDelivery does, separately. Idempotency-Key makes a retry
    // replay rather than duplicate.
    push: write({
      consequence: "provider-write",
      approval: "user",
      idempotent: true,
      reversible: true,
      undoWith: "adsWrite.deletePlatformCampaign",
      surfaces: APPROVAL_PRODUCT,
    }),
    // The one action that starts money moving. Pausing is the same action
    // with the opposite status, which is why it is reversible.
    setDelivery: write({
      consequence: "provider-write",
      approval: "user",
      idempotent: true,
      reversible: true,
      undoWith: "adsWrite.setDelivery",
      surfaces: APPROVAL_PRODUCT,
    }),
    // Cascades to ad sets and ads on the platform and takes reporting history
    // with it. Pausing is nearly always what was actually wanted.
    deletePlatformCampaign: write({
      consequence: "provider-write",
      approval: "user",
      idempotent: false,
      reversible: false,
      surfaces: APPROVAL_PRODUCT,
    }),
    // Provider write, no spend. Zernio's create is NOT idempotent — never
    // auto-retry; surface failures to the operator.
    createAudience: write({
      consequence: "provider-write",
      approval: "user",
      idempotent: false,
      reversible: true,
      surfaces: APPROVAL_PRODUCT,
    }),
    // Server-side hashed upload into an existing list; resumable batches.
    addAudienceUsers: write({
      consequence: "provider-write",
      approval: "user",
      idempotent: true,
      reversible: true,
      surfaces: APPROVAL_PRODUCT,
    }),
    // Create + upload, and create a lookalike: provider writes, no spend.
    // Both create a Meta audience, which Zernio cannot make idempotent.
    uploadPersonaSeedList: write({
      consequence: "provider-write",
      approval: "user",
      idempotent: false,
      reversible: true,
      surfaces: APPROVAL_PRODUCT,
    }),
    createPersonaLookalike: write({
      consequence: "provider-write",
      approval: "user",
      idempotent: false,
      reversible: true,
      surfaces: APPROVAL_PRODUCT,
    }),
    assignPersonaAudience: write({ idempotent: true }),
    createSpecializedMetaDraft: write({
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
  mediaLibraryRead: {
    list: read(),
    // Reads the brand's own site feed; nothing enters the library.
    listingPhotos: read("provider-read"),
  },
  sessionRead: { get: read() },
  mediaLibraryWrite: {
    // Promotion dedups by URL, so re-saving the same paste is a no-op; the
    // model-write consequence covers the auto-tag analysis pass.
    saveChatMedia: write({ idempotent: true, consequence: "model-write" }),
    // Idempotent per photo URL: a hero already in the library is returned.
    importListingPhotos: write({
      idempotent: true,
      consequence: "provider-read",
    }),
  },
  playbookRead: { list: read(), read: read() },
  strategyRead: { getTargets: read(), proposeTargets: read("model-read") },
  strategyWrite: {
    createCadence: write(),
    updateCadence: write({ idempotent: true }),
    setSeriesCadence: write({ idempotent: true }),
    createBrandMix: write(),
    updateBrandMix: write({ idempotent: true }),
  },
  launchRead: {
    list: read("local-read", ALL),
    get: read("local-read", ALL),
  },
  launchWrite: {
    create: write(),
    // Merging brief fields is a plain field edit: re-running with the same
    // payload lands the same row, and the previous value is visible in the UI.
    setBrief: write({ idempotent: true, undoWith: "launchWrite.setBrief" }),
    setFields: write({ idempotent: true, undoWith: "launchWrite.setFields" }),
    setFeatures: write({
      idempotent: true,
      undoWith: "launchWrite.setFeatures",
    }),
    setDeliverable: write({
      idempotent: true,
      undoWith: "launchWrite.setDeliverable",
    }),
    // Records a pointer; the referenced draft is untouched either way.
    attach: write({ idempotent: true, undoWith: "launchWrite.setDeliverable" }),
  },
  planningRead: {
    previewSlots: read("model-read", ALL),
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
  const operation = growthOperation(name);
  const policies = (
    growthActionPolicies as Record<string, Record<string, GrowthActionPolicy>>
  )[operation.capability];
  if (!policies)
    throw new Error(`Missing Growth capability policy for ${name}`);
  const action =
    operation.action ??
    (typeof input === "object" &&
    input !== null &&
    "action" in input &&
    typeof input.action === "string"
      ? input.action
      : undefined);
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
