import "server-only";

import {
  addAudienceAction,
  addAudienceUsersAction,
  adsScope,
  attachCampaignAction,
  boostMetaPostAction,
  createAudienceAction,
  createGoogleAdAction,
  createMetaAdDraftAction,
  deleteAdDraftAction,
  deleteAudienceAction,
  deleteCampaignDraftAction,
  deletePlatformCampaignAction,
  draftAdAction,
  draftCampaignAction,
  duplicateMetaCampaignAction,
  listAdsDestinations,
  importCreativeAction,
  linkAudienceAction,
  listCampaignsAction,
  openCampaignAction,
  planPlatformAction,
  previewAdAction,
  pullPlatformAudiencesAction,
  pushDraftAction,
  setCreativePoolAction,
  setDeliveryAction,
  setPlatformDraftAction,
  topAds,
  updateAudienceAction,
  draftAdsFromHomesAction,
  buildAdSetAction,
  setAdStatusAction,
  setAdCopyAction,
  replaceAdCardAction,
} from "./ads";
import { diagnoseAlignment } from "./alignment";
import { AMPLIFICATION_TOOLS } from "./amplification";
import {
  createPersona,
  deletePersona,
  listPersonas,
  updatePersona,
} from "./personas";
import { getBrandMap } from "./brand-map";
import {
  createBrandAction,
  enrichBrandAction,
  previewBrandPurgeAction,
  purgeBrandAction,
  listBrands,
  createProspectAction,
  setBrandRelationshipAction,
  setBrandMarkAction,
  addBrandAdPreviewAction,
  setPerformanceSettingsAction,
} from "./brands";
import { listPlaybooksAction, readPlaybookAction } from "./playbooks";
import { CONTENT_STRATEGY_TOOLS } from "./content-strategy";
import { inspectConversionReality } from "./conversions";
import {
  addContentCrossPost,
  attachChatImageToContent,
  attachLibraryMediaToContent,
  contentPipelineSummary,
  createIdea,
  createPlatformPost,
  deleteContentWorkItem,
  finishContentMediaUploads,
  freezeCompositionToLibrary,
  directCompositionAction,
  writeCompositionCopyAction,
  extendCompositionAction,
  getContentWorkItem,
  importRemoteImagesToContent,
  makeCarouselFromPool,
  prepareContentMediaUploads,
  productionQueue,
  promotePlatformPost,
  publishBlogDraft,
  recoverArchiveMediaToContent,
  suggestMediaForContent,
  searchContentWorkItems,
  setPlatformPostFirstComment,
  setPlatformPostThread,
  upcomingContent,
  updateContentWorkItem,
} from "./content";
import {
  browseDrive,
  driveConnectionStatus,
  importDriveFilesToContent,
} from "./drive";
import { EMAIL_TOOLS } from "./email";
import { leadsRewriteSequence, leadsSequence, leadsSummary } from "./leads";
import { recentMentions } from "./listening";
import { nextForBrand } from "./next";
import {
  analyzeMediaAsset,
  analyzeTimelineVideo,
  createBrandMix,
  createChannelCadence,
  discoverBrandChannels,
  getMediaAnalysis,
  getStrategyTargets,
  listMediaAnalyses,
  listPublishingConnections,
  openTimelinePost,
  proposeContentGroupings,
  proposeStrategyTargets,
  registerBrandChannel,
  getSharedSession,
  listMediaLibrary,
  saveChatMediaToLibrary,
  scrapeBrandPosts,
  setSeriesCadence,
  syncBrandBlog,
  syncBrandWebsite,
  syncOwnedBrandContent,
  updateBrandMix,
  updateChannelCadence,
  listListingPhotos,
  importListingPhotos,
} from "./operations";
import { LAUNCH_TOOLS } from "./launch";
import { PLANNING_TOOLS } from "./planning";
import {
  applyLivePostMatchAction,
  proposeLivePost,
  publishSocialPostNow,
  recordExternalPublish,
  rescheduleSocialPost,
  scheduleSocialPost,
  updateScheduledFirstComment,
} from "./publishing";
import {
  assignProductStorefrontManager,
  captureProductStorefrontReference,
  confirmProductStorefrontCurrent,
  copySiblingStorefrontContent,
  createProductAtlasProduct,
  createProductStorefront,
  listProductAtlasProducts,
  listProductStorefronts,
  listProductStorefrontReferences,
  markProductStorefrontStale,
  readProductAtlas,
  readProductStorefront,
  removeProductStorefrontReference,
  updateProductAtlas,
  updateProductStorefront,
} from "./product-storefront";
import {
  addPerformancePropertyAction,
  attachToPerformanceCycleAction,
  createPerformanceAccountAction,
  getPerformanceAccountAction,
  listPerformanceAccountsAction,
  listSponsoredAbandonmentAction,
  openPerformanceCycleAction,
  refreshPerformanceCycleSpendAction,
  searchAttachableCampaignsAction,
  syncAdCampaignsAction,
  updatePerformanceAccountAction,
  updatePerformanceCycleAction,
  updatePerformancePropertyAction,
  clientCampaignContextAction,
  listIntakesAction,
  previewIntakeApplyAction,
  applyIntakeAction,
  verifyIntakeAccessAction,
  promoteToClientAction,
} from "./performance";
import { readWebPage, webSearch } from "./research";
import { growthDomainTool } from "./types";

export const brandRead = growthDomainTool({
  description: "Read brands, their mapped surfaces, and the next useful move.",
  actions: { list: listBrands, getMap: getBrandMap, next: nextForBrand },
});

export const brandWrite = growthDomainTool({
  description:
    "Create an owned brand, enrich one from its website (logo, tagline, description), or purge one on offboarding. Create first, enrich second: they are deliberately separate steps. Purge is irreversible and needs previewPurge first.",
  actions: {
    create: createBrandAction,
    createProspect: createProspectAction,
    setRelationship: setBrandRelationshipAction,
    enrich: enrichBrandAction,
    setMark: setBrandMarkAction,
    addAdPreview: addBrandAdPreviewAction,
    setPerformanceSettings: setPerformanceSettingsAction,
    previewPurge: previewBrandPurgeAction,
    purge: purgeBrandAction,
  },
});

export const productAtlasRead = growthDomainTool({
  description: "List Product Atlas products or read one complete Atlas.",
  actions: { list: listProductAtlasProducts, get: readProductAtlas },
});

export const productAtlasWrite = growthDomainTool({
  description: "Create or update a Product Atlas product.",
  actions: { create: createProductAtlasProduct, update: updateProductAtlas },
});

export const storefrontRead = growthDomainTool({
  description:
    "List product storefronts, read one complete storefront, or inspect its point-in-time references.",
  actions: {
    list: listProductStorefronts,
    get: readProductStorefront,
    listReferences: listProductStorefrontReferences,
  },
});

export const storefrontWrite = growthDomainTool({
  description:
    "Create or update storefronts and operate their ownership and freshness workflow.",
  actions: {
    create: createProductStorefront,
    update: updateProductStorefront,
    markStale: markProductStorefrontStale,
    confirmCurrent: confirmProductStorefrontCurrent,
    assignManager: assignProductStorefrontManager,
    copySiblingContent: copySiblingStorefrontContent,
    captureReference: captureProductStorefrontReference,
    removeReference: removeProductStorefrontReference,
  },
});

export const performanceRead = growthDomainTool({
  description:
    "Read Performance accounts, the commercial record of each client paying Wander to run performance marketing for their homes, with their properties, billing cycles, and attached delivery.",
  actions: {
    list: listPerformanceAccountsAction,
    get: getPerformanceAccountAction,
    searchAttachableCampaigns: searchAttachableCampaignsAction,
    sponsoredAbandonment: listSponsoredAbandonmentAction,
    clientCampaignContext: clientCampaignContextAction,
    intakes: listIntakesAction,
    previewIntakeApply: previewIntakeApplyAction,
  },
});

export const performanceWrite = growthDomainTool({
  description:
    "Manage Performance accounts: onboard clients, add their homes, open and update billing cycles, and attach existing delivery (campaigns, lifecycle campaigns, amplification targets) to a cycle. Never creates ads or sends anything.",
  actions: {
    createAccount: createPerformanceAccountAction,
    updateAccount: updatePerformanceAccountAction,
    addProperty: addPerformancePropertyAction,
    updateProperty: updatePerformancePropertyAction,
    openCycle: openPerformanceCycleAction,
    updateCycle: updatePerformanceCycleAction,
    attach: attachToPerformanceCycleAction,
    refreshSpend: refreshPerformanceCycleSpendAction,
    syncCampaigns: syncAdCampaignsAction,
    promoteToClient: promoteToClientAction,
    applyIntake: applyIntakeAction,
    verifyIntakeAccess: verifyIntakeAccessAction,
  },
});

export const personaRead = growthDomainTool({
  description:
    "Read a brand's personas — the stable 'who we talk to' layer that inspires campaign audiences and content.",
  actions: { list: listPersonas },
});

export const personaWrite = growthDomainTool({
  description:
    "Create, update, or soft-delete brand personas. Personas are few and stable; a geo or age variant belongs on a campaign audience instead.",
  actions: {
    create: createPersona,
    update: updatePersona,
    delete: deletePersona,
  },
});

export const researchRead = growthDomainTool({
  description:
    "Search the open web or read one known page as untrusted research evidence.",
  actions: { search: webSearch, readPage: readWebPage },
});

export const driveRead = growthDomainTool({
  description:
    "Check Google Drive connection status and browse the operator's Drive for importable images.",
  actions: { status: driveConnectionStatus, browse: browseDrive },
});

export const contentRead = growthDomainTool({
  description:
    "Read pipeline, upcoming, production, work-item, or media state.",
  actions: {
    pipeline: contentPipelineSummary,
    upcoming: upcomingContent,
    productionQueue,
    getWorkItem: getContentWorkItem,
    search: searchContentWorkItems,
    suggestMedia: suggestMediaForContent,
  },
});

export const contentWrite = growthDomainTool({
  description: "Create and refine canonical content work and platform posts.",
  actions: {
    createIdea,
    updateWorkItem: updateContentWorkItem,
    setFirstComment: setPlatformPostFirstComment,
    setThread: setPlatformPostThread,
    addCrossPost: addContentCrossPost,
    createPlatformPost,
    promotePlatformPost,
    publishBlogDraft,
    deleteWorkItem: deleteContentWorkItem,
  },
});

export const contentMediaWrite = growthDomainTool({
  description:
    "Attach, recover, or turn ordered pool images into platform media.",
  actions: {
    attachChatImage: attachChatImageToContent,
    attachLibraryMedia: attachLibraryMediaToContent,
    freezeComposition: freezeCompositionToLibrary,
    directComposition: directCompositionAction,
    writeCopy: writeCompositionCopyAction,
    extendComposition: extendCompositionAction,
    recoverArchiveMedia: recoverArchiveMediaToContent,
    makeCarousel: makeCarouselFromPool,
    prepareUpload: prepareContentMediaUploads,
    finishUpload: finishContentMediaUploads,
    importRemoteImages: importRemoteImagesToContent,
    importFromDrive: importDriveFilesToContent,
  },
});

export const emailRead = growthDomainTool({
  description: "Read one email draft.",
  actions: { get: EMAIL_TOOLS.getEmailDraft },
});

export const emailWrite = growthDomainTool({
  description:
    "Create, revise, deliberately generate, or permanently delete an email draft.",
  actions: {
    createSlot: EMAIL_TOOLS.createEmailSlot,
    createDigestFromRow: EMAIL_TOOLS.createDigestFromRow,
    setDigestImage: EMAIL_TOOLS.setDigestImage,
    createProductUpdate: EMAIL_TOOLS.createProductUpdateDraft,
    updateDraft: EMAIL_TOOLS.updateEmailDraft,
    generateDraft: EMAIL_TOOLS.generateEmailDraft,
    deleteDraft: EMAIL_TOOLS.deleteEmailDraft,
  },
});

export const contentStrategyRead = growthDomainTool({
  description: "Read one brand's pillars, series, and grouping proposals.",
  actions: { get: CONTENT_STRATEGY_TOOLS.getContentStrategy },
});

export const contentStrategyWrite = growthDomainTool({
  description:
    "Save, organize, or permanently delete one brand's content strategy structure.",
  actions: {
    savePillar: CONTENT_STRATEGY_TOOLS.saveContentPillar,
    saveSeries: CONTENT_STRATEGY_TOOLS.saveContentSeries,
    deleteSeries: CONTENT_STRATEGY_TOOLS.deleteContentSeries,
    clearSeries: CONTENT_STRATEGY_TOOLS.clearContentSeries,
    organizeIdeas: CONTENT_STRATEGY_TOOLS.organizeContentIdeas,
    proposeGroupings: proposeContentGroupings,
    resolveGrouping: CONTENT_STRATEGY_TOOLS.resolveContentGrouping,
  },
});

export const adsRead = growthDomainTool({
  description:
    "Read paid-ad scope and performance, inspect allowlisted Zernio destinations, diagnose intent alignment, or inspect conversion mappings.",
  actions: {
    scope: adsScope,
    top: topAds,
    listDestinations: listAdsDestinations,
    openCampaign: openCampaignAction,
    listCampaigns: listCampaignsAction,
    previewAd: previewAdAction,
    diagnoseAlignment,
    inspectConversions: inspectConversionReality,
  },
});

export const adsWrite = growthDomainTool({
  description:
    'Build and ship paid campaigns. TWO LAYERS: the first-party draft (draftCampaign, draftAd, addAdSet and the rest) is local rows only, touches no ad platform, and needs no approval — start there for "make a campaign" unless the user asks for the platform by name. Only push, setDelivery and the create* actions reach Meta, Google or LinkedIn, and those are account-allowlisted and approval-gated. Everything is created paused except boostMetaPost and createGoogle; setDelivery is what starts spend.',
  actions: {
    draftCampaign: draftCampaignAction,
    draftAd: draftAdAction,
    draftAdsFromHomes: draftAdsFromHomesAction,
    buildAdSet: buildAdSetAction,
    setAdStatus: setAdStatusAction,
    setAdCopy: setAdCopyAction,
    replaceAdCard: replaceAdCardAction,
    addAudience: addAudienceAction,
    updateAudience: updateAudienceAction,
    planPlatform: planPlatformAction,
    setCreativePool: setCreativePoolAction,
    setPlatformDraft: setPlatformDraftAction,
    attachCampaign: attachCampaignAction,
    pullPlatformAudiences: pullPlatformAudiencesAction,
    linkAudience: linkAudienceAction,
    importCreative: importCreativeAction,
    deleteCampaignDraft: deleteCampaignDraftAction,
    deleteAudience: deleteAudienceAction,
    deleteAdDraft: deleteAdDraftAction,
    push: pushDraftAction,
    setDelivery: setDeliveryAction,
    deletePlatformCampaign: deletePlatformCampaignAction,
    createMetaDraft: createMetaAdDraftAction,
    createAudience: createAudienceAction,
    addAudienceUsers: addAudienceUsersAction,
    createGoogle: createGoogleAdAction,
    boostMetaPost: boostMetaPostAction,
    duplicateMetaCampaign: duplicateMetaCampaignAction,
  },
});

export const publishingRead = growthDomainTool({
  description:
    "Read publishing connections, open one timeline post, or work out which live post a hand-posted spot became.",
  actions: {
    connections: listPublishingConnections,
    openTimelinePost,
    proposeLivePost,
  },
});

export const publishingWrite = growthDomainTool({
  description:
    "Schedule, immediately publish, reschedule, or update a queued first comment through Zernio — every one of those is an approval-gated provider write. `recordExternalPublish` is the exception: it only records a send that already happened somewhere else.",
  actions: {
    schedule: scheduleSocialPost,
    publishNow: publishSocialPostNow,
    reschedule: rescheduleSocialPost,
    updateFirstComment: updateScheduledFirstComment,
    recordExternalPublish,
    applyLivePostMatch: applyLivePostMatchAction,
  },
});

export const sourceSyncWrite = growthDomainTool({
  description:
    "Discover, register, and synchronize provider-backed brand sources.",
  actions: {
    discoverChannels: discoverBrandChannels,
    registerChannel: registerBrandChannel,
    scrapePosts: scrapeBrandPosts,
    syncOwnedContent: syncOwnedBrandContent,
    syncWebsite: syncBrandWebsite,
    syncBlog: syncBrandBlog,
  },
});

export const mediaAnalysisRead = growthDomainTool({
  description: "List or read durable image and video analyses.",
  actions: { list: listMediaAnalyses, get: getMediaAnalysis },
});

export const mediaAnalysisWrite = growthDomainTool({
  description:
    "Analyze a library image or video (analyzeImage handles both), or prepare a durable storyboard analysis of a timeline post's video.",
  actions: {
    analyzeImage: analyzeMediaAsset,
    prepareVideo: analyzeTimelineVideo,
  },
});

export const mediaLibraryWrite = growthDomainTool({
  description:
    "Save operator-pasted chat media into an owned brand's durable media library, or import the hero photos of the brand's own homes from its WanderOS site.",
  actions: {
    saveChatMedia: saveChatMediaToLibrary,
    importListingPhotos,
  },
});

export const playbookRead = growthDomainTool({
  description:
    "The playbooks: step-by-step procedures to follow with the other tools (kind procedure), and reference texts. Read a procedure before starting the job it describes.",
  actions: { list: listPlaybooksAction, read: readPlaybookAction },
});

export const sessionRead = growthDomainTool({
  description:
    "Read a shared assistant session by id, to see what another session already worked out. Shared sessions only.",
  actions: { get: getSharedSession },
});

export const mediaLibraryRead = growthDomainTool({
  description:
    "Browse an owned brand's media library, or look at the homes and hero photos on its WanderOS site before importing any. Use list when the operator says to use, pick, or reuse something already saved, rather than asking them to re-attach it.",
  actions: { list: listMediaLibrary, listingPhotos: listListingPhotos },
});

export const strategyRead = growthDomainTool({
  description:
    "Read current targets or propose evidence-backed target changes.",
  actions: {
    getTargets: getStrategyTargets,
    proposeTargets: proposeStrategyTargets,
  },
});

export const strategyWrite = growthDomainTool({
  description:
    "Create or update channel cadence, series cadence, and brand-mix targets.",
  actions: {
    createCadence: createChannelCadence,
    updateCadence: updateChannelCadence,
    setSeriesCadence,
    createBrandMix,
    updateBrandMix,
  },
});

export const launchRead = growthDomainTool({
  description:
    "Read launches: the list with tier, date and readiness, or one launch in full with its brief, per-surface owners, linked work, and what it still needs.",
  actions: {
    list: LAUNCH_TOOLS.listLaunches,
    get: LAUNCH_TOOLS.readLaunch,
  },
});

export const launchWrite = growthDomainTool({
  description:
    "Create a launch, merge fields into its brief, set its own fields, set one surface's owner and ready-by date, or point a surface at the draft that fulfils it. Small verbs — sequence them, never expect one call to plan a launch.",
  actions: {
    create: LAUNCH_TOOLS.createLaunch,
    setBrief: LAUNCH_TOOLS.setBrief,
    setFields: LAUNCH_TOOLS.setFields,
    setFeatures: LAUNCH_TOOLS.setFeatures,
    setDeliverable: LAUNCH_TOOLS.setDeliverable,
    attach: LAUNCH_TOOLS.attach,
  },
});

export const planningRead = growthDomainTool({
  description: "Preview the cadence-driven content slots a brand is missing.",
  actions: {
    previewSlots: PLANNING_TOOLS.previewTwoWeekSlots,
  },
});

export const planningWrite = growthDomainTool({
  description: "Generate cadence-driven content slots.",
  actions: {
    generateSlots: PLANNING_TOOLS.generateTwoWeekSlots,
  },
});

export const amplificationRead = growthDomainTool({
  description:
    "Read the amplifier rolodex with per-contact ask history — who can boost a post and how reliably they deliver.",
  actions: { list: AMPLIFICATION_TOOLS.listAmplifiers },
});

export const amplificationWrite = growthDomainTool({
  description:
    "Plan amplification for a specific platform post, then explicitly notify one human through Slack when approved.",
  actions: {
    request: AMPLIFICATION_TOOLS.requestAmplification,
    notify: AMPLIFICATION_TOOLS.notifyAmplification,
  },
});

export const leadsRead = growthDomainTool({
  description:
    "Read lead totals, the current pipeline summary, and the generated outreach sequence for a specific domain.",
  actions: { summary: leadsSummary, sequence: leadsSequence },
});

export const leadsWrite = growthDomainTool({
  description:
    "Rewrite a lead's outreach sequence from a plain-language instruction. Saves a draft; never publishes to HubSpot and never enrolls.",
  actions: { rewriteSequence: leadsRewriteSequence },
});

export const listeningRead = growthDomainTool({
  description: "Read recent brand mentions and listening triage.",
  actions: { recent: recentMentions },
});

export const DOMAIN_CAPABILITY_TOOLS = {
  driveRead,
  brandRead,
  brandWrite,
  productAtlasRead,
  productAtlasWrite,
  storefrontRead,
  storefrontWrite,
  personaRead,
  personaWrite,
  performanceRead,
  performanceWrite,
  researchRead,
  contentRead,
  contentWrite,
  contentMediaWrite,
  emailRead,
  emailWrite,
  contentStrategyRead,
  contentStrategyWrite,
  adsRead,
  adsWrite,
  publishingRead,
  publishingWrite,
  sourceSyncWrite,
  mediaAnalysisRead,
  mediaAnalysisWrite,
  mediaLibraryRead,
  sessionRead,
  mediaLibraryWrite,
  strategyRead,
  strategyWrite,
  launchRead,
  launchWrite,
  planningRead,
  planningWrite,
  amplificationRead,
  amplificationWrite,
  leadsRead,
  leadsWrite,
  listeningRead,
  playbookRead,
} as const;
