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
// Actions that need a person's yes in the in-app chat, which shows its
// approval card. MCP runs them without asking: the person connected the
// client, and its own tool approval is theirs to set. invoke-growth has no
// way to ask, so it does not get them.
const CONFIRMED = ["overview-chat", "mcp", "test"] as const;
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
  seedRead: {
    list: read(),
    deliveries: read(),
    assetStatus: read("provider-read"),
  },
  seedWrite: {
    build: write({ consequence: "provider-read" }),
    refresh: write({ consequence: "provider-read" }),
    share: write({
      consequence: "provider-write",
      approval: "user",
      surfaces: CONFIRMED,
      idempotent: true,
    }),
    attach: write({ idempotent: true }),
    upload: write({
      consequence: "provider-write",
      approval: "user",
      surfaces: CONFIRMED,
      idempotent: false,
    }),
    lookalike: write({
      consequence: "provider-write",
      approval: "user",
      surfaces: CONFIRMED,
      idempotent: false,
    }),
  },
  creativeRead: {
    list: read(),
    get: read(),
    exportArticle: read(),
    articleHistory: read(),
    articleRevision: read(),
  },
  creativeWrite: {
    acceptCurrentArticle: write({ idempotent: true }),
    acceptArticle: write({ idempotent: true }),
    restoreArticle: write(),
    dismissArticle: write({ idempotent: true }),
    create: write(),
    save: write(),
    select: write(),
    produce: write({ consequence: "model-write" }),
    cancel: write({ idempotent: true }),
    pullDato: write({ consequence: "provider-read" }),
    pushDato: write({ consequence: "provider-write" }),
  },
  workbookRead: { list: read(), get: read(), options: read() },
  workbookWrite: {
    import: write(),
    save: write(),
    apply: write({ idempotent: true }),
  },
  referenceBoardRead: { list: read(), get: read(), media: read() },
  referenceBoardWrite: {
    save: write(),
    addReference: write(),
    editReferences: write(),
    saveProposal: write(),
    acceptProposal: write({ idempotent: true }),
  },
  initiativeRead: { list: read(), get: read(), options: read() },
  initiativeWrite: {
    save: write(),
    link: write({ idempotent: true }),
    unlink: write({ idempotent: true }),
  },
  operationRead: { status: read() },
  workspaceOverview: { overview: read() },
  navigateWorkspace: { navigate: read() },
  prepareProductionPacket: { prepare: write() },
  renderSocialPosts: { render: read() },
  presentNextOptions: { present: read() },
  presentCopyOptions: { present: read() },
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
    get: read("local-read", ALL),
    getMap: read("local-read", ALL),
    next: read("local-read", ALL),
    identity: read("local-read", ALL),
    context: read("local-read", ALL),
    suggestMarkets: read("model-read"),
    recommendMark: read("model-read", ALL),
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
    // A reference onto the brand row; the card already exists in the library.
    addAdPreview: write({ idempotent: true }),
    // A merge into the brand's settings JSONB; the same patch twice is a no-op.
    setPerformanceSettings: write({ idempotent: true }),
    // Plain brand fields; writing the old values back is the undo.
    update: write({ idempotent: true, undoWith: "brandWrite.update" }),
    setMarkets: write({ idempotent: true }),
    // Writes the story from one model call; undo by writing the old text back.
    updateStory: write({
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
  personaRead: {
    list: read(),
    suggest: read("model-read"),
    wanderOsContext: read(),
  },
  performanceRead: {
    reportWorkspace: read(),
    reviewReport: read(),
    pitch: read(),
    draftPitch: read("model-read"),
    list: read(),
    get: read(),
    searchAttachableCampaigns: read(),
    sponsoredAbandonment: read(),
    clientCampaignContext: read(),
    featuredHomes: read(),
    homeGroups: read(),
    launchChecklist: read(),
    bookingTargets: read(),
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
    saveReportDraft: write(),
    publishReport: write({ approval: "user" }),
    revokeReportShare: write({ approval: "user", idempotent: true }),
    savePitch: write({ undoWith: "performanceWrite.savePitch" }),
    saveHomeGroup: write(),
    recordLaunchChecklist: write(),
    changeHomeGroupHomes: write({ idempotent: true }),
    deleteHomeGroup: write(),
    // Moves which group leads; members and campaigns are untouched and it
    // can be switched back.
    setPrimaryHomeGroup: write({ idempotent: true }),
    saveBookingTarget: write(),
    attachBookingTarget: write({ idempotent: true }),
    setWanderOsEnabled: write({ idempotent: true }),
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
    // reopen a cycle an operator may have since corrected. It records the
    // month's planned budget; nothing is spent, so it runs without asking.
    applyIntake: write(),
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
    setPublishSettings: write({ idempotent: true }),
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
    attachChatImage: write(),
    attachLibraryMedia: write(),
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
    finishUpload: write(),
    importRemoteImages: write({ consequence: "provider-write" }),
    importFromDrive: write({ consequence: "provider-write" }),
  },
  emailRead: {
    previewBroadcasts: read(),
    broadcastStatus: read(),
    previewOptions: read(),
    listTemplates: read(),
    listSequences: read(),
    getSequence: read(),
    sequenceEmails: read(),
    sequenceStatus: read(),
    previewSequence: read(),
    get: read(),
    audiences: read(),
    previewAudience: read(),
  },
  emailWrite: {
    addAudienceMembers: write(),
    prepareBroadcast: write(),
    scheduleBroadcasts: write({
      approval: "user",
      consequence: "background-run",
      idempotent: true,
      reversible: false,
      surfaces: CONFIRMED,
    }),
    pauseBroadcast: write({ idempotent: true }),
    recoverBroadcast: write({
      approval: "user",
      consequence: "background-run",
      idempotent: true,
      reversible: false,
      surfaces: CONFIRMED,
    }),
    sharePreview: write({ approval: "user" }),
    saveSequence: write(),
    archiveSequence: write({ idempotent: true, reversible: false }),
    prepareSequence: write(),
    pauseSequence: write({ idempotent: true }),
    activateSequence: write({
      approval: "user",
      consequence: "background-run",
      idempotent: true,
      reversible: false,
      surfaces: CONFIRMED,
    }),
    enrollSequence: write({
      approval: "user",
      consequence: "background-run",
      idempotent: true,
      reversible: false,
      surfaces: CONFIRMED,
    }),
    recoverSequence: write({
      approval: "user",
      consequence: "background-run",
      idempotent: true,
      reversible: false,
      surfaces: CONFIRMED,
    }),
    cancelSequenceEnrollment: write({ idempotent: true, reversible: false }),
    saveAudience: write(),
    createSlot: write(),
    createDigestFromRow: write(),
    draftFromTemplate: write({ consequence: "model-write" }),
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
    // Local content can be cleared and regenerated directly.
    clearSeries: write({ reversible: false }),
    organizeIdeas: write({ idempotent: true }),
    proposeGroupings: write({ consequence: "model-write" }),
    resolveGrouping: write({ idempotent: true }),
  },
  adsRead: {
    scope: read("provider-read"),
    top: read("provider-read"),
    listDestinations: read("provider-read"),
    listLeadForms: read("provider-read"),
    openCampaign: read(),
    listCampaigns: read(),
    ideaHomePhotos: read(),
    ideaContext: read(),
    catalogHomeFacts: read(),
    // Reading can ingest a home new since the last read, so it has a row.
    catalogState: read(),
    wanderOsImportStatus: read(),
    catalogWriteStatus: read(),
    suggestCampaignAudiences: read("model-read"),
    // Renders via Meta's preview API; creates nothing.
    previewAd: read("provider-read"),
    diagnoseAlignment: read("model-read"),
    inspectConversions: read(),
  },
  reviewRead: { listComments: read() },
  reviewWrite: {
    addComment: write(),
    deleteComment: write({ idempotent: true }),
  },
  adsWrite: {
    // Local DB rows only; no provider call, no spend. Push is separate.
    draftCampaign: write(),
    draftAd: write(),
    // One model call; lands unapproved text drafts only.
    writeGoogleTextAds: write({ consequence: "model-write" }),
    // Routing is local: which platforms an unpushed idea compiles to.
    setAdPlatforms: write({ idempotent: true }),
    // Local copy of an approved ad as a draft; the original is untouched.
    returnToStudio: write(),
    // Approving is a local review state; the push is the step that reaches a
    // platform, so agents approve without a confirmation round trip.
    setAdStatus: write({ idempotent: true }),
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
    importWanderOs: write({ consequence: "background-run", idempotent: true }),
    newCatalogCopy: write({ consequence: "model-write" }),
    newCatalogPhoto: write({ consequence: "model-write" }),
    // The export ships only approved cards, so approval is the operator's.
    setCatalogApproval: write({
      idempotent: true,
      approval: "user",
      surfaces: CONFIRMED,
    }),
    setCatalogIncluded: write({ idempotent: true }),
    setCatalogDefaultTemplate: write({ idempotent: true }),
    setCatalogAdCopy: write({ idempotent: true }),
    writeCatalogAdCopy: write({ consequence: "model-write" }),
    exportCatalog: write({ consequence: "background-run" }),
    // Real delete of the run, its library folder and its images. An export is
    // a frozen copy that can be made again, so there is no trash.
    deleteCatalogExport: write({ reversible: false }),
    // Sets one field on local rows; the push is still the provider step.
    attachAdSet: write(),
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
    setDeliveryGroup: write({ idempotent: true }),
    deleteDeliveryGroup: write({ reversible: false }),
    attachCampaign: write({ idempotent: true }),
    importMetaCampaign: write({ idempotent: true }),
    // Reads the provider's audiences; writes only Growth's mirror rows and
    // changes nothing on the ad account.
    pullPlatformAudiences: write({
      consequence: "provider-read",
      idempotent: true,
    }),
    linkAudience: write({ idempotent: true }),
    // Creates a custom conversion on the ad account, or reuses the matching
    // one; spends nothing and changes no campaign.
    createReportingConversion: write({
      consequence: "provider-write",
      idempotent: true,
    }),
    // Creates an instant form on the brand's Facebook Page. Meta cannot edit
    // or hard-delete a form (archive only) and a retry makes one more; it
    // spends nothing and changes no campaign.
    createLeadForm: write({
      consequence: "provider-write",
      idempotent: false,
      reversible: false,
    }),
    // Makes a Google Ads account under the manager and a conversion on it.
    // Currency and time zone are permanent, but nothing is spent.
    createGoogleAdsAccount: write({
      consequence: "provider-write",
      idempotent: true,
      reversible: false,
    }),
    // Downloads from the platform CDN into R2; dedupes by source url.
    importCreative: write({ idempotent: true, reversible: true }),
    // Draft deletes drop local rows and are refused once the thing exists on
    // a platform, so they cannot destroy anything a provider knows about.
    deleteCampaignDraft: write({ reversible: false }),
    // The one delete that leaves platform campaigns spending, so the operator
    // approves it.
    deleteCampaignLeavingPlatform: write({
      approval: "user",
      reversible: false,
      surfaces: CONFIRMED,
    }),
    deleteAudience: write({ reversible: false }),
    // Deletes the ad on the platform too when it is live there.
    deleteAdDraft: write({
      consequence: "provider-write",
      approval: "user",
      reversible: false,
      surfaces: CONFIRMED,
    }),
    // Creates the campaign tree PAUSED, so the push spends nothing and runs
    // without asking; setDelivery starts spend, and that one asks.
    // Idempotency-Key makes a retry replay rather than duplicate.
    push: write({
      consequence: "provider-write",
      idempotent: true,
      reversible: true,
      undoWith: "adsWrite.deletePlatformCampaign",
    }),
    // The one action that starts money moving. Pausing is the same action
    // with the opposite status, which is why it is reversible.
    setDelivery: write({
      consequence: "provider-write",
      approval: "user",
      idempotent: true,
      reversible: true,
      undoWith: "adsWrite.setDelivery",
      surfaces: CONFIRMED,
    }),
    // Cascades to ad sets and ads on the platform and takes reporting history
    // with it. Pausing is nearly always what was actually wanted.
    deletePlatformCampaign: write({
      consequence: "provider-write",
      approval: "user",
      idempotent: false,
      reversible: false,
      surfaces: CONFIRMED,
    }),
    // Provider write, no spend. Zernio's create is NOT idempotent — never
    // auto-retry; surface failures to the operator.
    createAudience: write({
      consequence: "provider-write",
      idempotent: false,
      reversible: true,
    }),
    // Server-side hashed upload into an existing list; resumable batches.
    // Create + upload, and create a lookalike: provider writes, no spend.
    // Both create a Meta audience, which Zernio cannot make idempotent.
    createPersonaLookalike: write({
      consequence: "provider-write",
      idempotent: false,
      reversible: true,
    }),
    assignPersonaAudience: write({ idempotent: true }),
    // Forced PAUSED: it cannot spend until setDelivery.
    createSpecializedMetaDraft: write({
      consequence: "provider-write",
      idempotent: true,
      reversible: false,
    }),
    // Zernio launches a boost ACTIVE, so it spends at once and asks first.
    boostMetaPost: write({
      consequence: "provider-write",
      approval: "user",
      idempotent: true,
      reversible: false,
      surfaces: CONFIRMED,
    }),
    // Local rows only: a draft copy the push takes to the platform later.
    duplicateCampaign: write(),
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
    suggestions: read(),
    list: read(),
    // Reads the brand's own site feed; nothing enters the library.
    listingPhotos: read("provider-read"),
  },
  sessionRead: { get: read() },
  mediaLibraryWrite: {
    discoverWebsiteImages: write({
      idempotent: true,
      consequence: "provider-read",
    }),
    reviewWebsiteImage: write({
      idempotent: true,
      consequence: "provider-read",
    }),
    // Promotion dedups by URL, so re-saving the same paste is a no-op; the
    // model-write consequence covers the auto-tag analysis pass.
    saveChatMedia: write({ idempotent: true, consequence: "model-write" }),
    prepareUpload: write(),
    finishUpload: write(),
    // Idempotent per photo URL: a hero already in the library is returned.
    importListingPhotos: write({
      idempotent: true,
      consequence: "provider-read",
    }),
  },
  playbookRead: { list: read(), read: read() },
  strategyRead: { getTargets: read(), proposeTargets: read("model-read") },
  strategyWrite: {
    setChannelCadence: write({ idempotent: true }),
    setSeriesCadence: write({ idempotent: true }),
    setBrandMix: write({ idempotent: true }),
  },
  planningRead: {
    previewSlots: read("model-read", ALL),
  },
  planningWrite: { generateSlots: write() },
  influencerRead: { partnerships: read() },
  influencerWrite: {
    savePartnership: write(),
    removePartnership: write({ reversible: false }),
  },
  amplificationRead: { list: read(), targets: read() },
  amplificationWrite: {
    saveContact: write(),
    update: write({ idempotent: true }),
    createOutput: write({ idempotent: true }),
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
  listeningRead: { recent: read(), browserRuns: read() },
  listeningWrite: {
    importBrowserRun: write({ idempotent: true, reversible: false }),
  },
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
