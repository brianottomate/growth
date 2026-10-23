import {
  refreshMetaCampaignAction,
  previewMetaAdditionsAction,
  publishMetaAdditionsAction,
  addDeliveryGroupAction,
} from "./ads";
import {
  prepareBroadcast,
  previewBroadcasts,
  scheduleBroadcastsAction,
  pauseBroadcastAction,
  recoverBroadcastAction,
  broadcastStatus,
} from "./email-broadcasts";
import {
  emailPreviewOptionsAction,
  shareEmailPreviewAction,
} from "./email-client-preview";
import {
  exportArticleAction,
  articleHistoryAction,
  acceptCurrentArticleAction,
  articleRevisionAction,
  acceptArticleAction,
  restoreArticleAction,
  dismissArticleAction,
} from "./article-history";
import {
  workbookListAction,
  workbookGetAction,
  workbookOptionsAction,
  workbookImportAction,
  workbookSaveAction,
  workbookApplyAction,
} from "./content-workbooks";
import {
  listBoardsAction,
  readBoardAction,
  boardMediaAction,
  saveBoardAction,
  addBoardReferenceAction,
  editBoardReferencesAction,
  saveBoardProposalAction,
  acceptBoardProposalAction,
} from "./reference-boards";
import {
  reportWorkspaceAction,
  saveReportDraftAction,
  reviewReportAction,
  publishReportAction,
  revokeReportShareAction,
} from "@/server/ai/capabilities/performance-reports";
import {
  listSeedsAction,
  buildSeedAction,
  refreshSeedAction,
  uploadSeedAction,
  seedAssetStatusAction,
  seedLookalikeAction,
  shareSeedLookalikeAction,
  seedDeliveriesAction,
  attachSeedAssetAction,
} from "./seeds";
import {
  addReviewCommentAction,
  deleteReviewCommentAction,
  listReviewCommentsAction,
} from "./review";
import {
  prepareEmailDnsAction,
  replaceEmailDnsLinkAction,
  recheckEmailDnsAction,
} from "./email-dns";
import {
  listSequences,
  getSequence,
  sequenceEmails,
  sequenceStatus,
  previewSequence,
  saveSequence,
  archiveSequence,
  prepareSequence,
  activateSequence,
  pauseSequence,
  enrollSequence,
  recoverSequence,
  cancelSequenceEnrollment,
} from "./email-sequences";
import {
  listCreativeDocuments,
  readCreativeDocument,
  createCreativeDocumentAction,
  saveCreativeDocumentAction,
  selectCreativeDocumentAction,
  produceCreativeDocument,
  cancelCreativeDocumentRun,
  pullCreativeDato,
  pushCreativeDato,
} from "./creative-documents";
import {
  getInitiativeAction,
  initiativeOptionsAction,
  linkInitiativeAction,
  listInitiativesAction,
  saveInitiativeAction,
  unlinkInitiativeAction,
} from "./initiatives";
import {
  launchChecklistAction,
  recordLaunchChecklistAction,
} from "./launch-checklist";
import {
  listEmailAudiencesAction,
  addEmailAudienceMembersAction,
  importEmailListAction,
  previewEmailAudienceAction,
  saveEmailAudienceAction,
} from "./email-audiences";
import {
  listMediaSuggestionsAction,
  discoverMediaSuggestionsAction,
  reviewMediaSuggestionAction,
} from "./media-review";
import { getPitchAction, savePitchAction, draftPitchAction } from "./pitch";
import {
  attachBookingTargetAction,
  bookingTargetAvailabilityAction,
  bookingTargetsAction,
  changeHomeGroupHomesAction,
  deleteHomeGroupAction,
  groupOpenHomesAction,
  setPrimaryHomeGroupAction,
  homeGroupsAction,
  saveBookingTargetAction,
  saveHomeGroupAction,
  setWanderOsEnabledAction,
} from "./home-groups";
import "server-only";

import {
  addAudienceAction,
  adsScope,
  attachCampaignAction,
  importMetaCampaignAction,
  boostMetaPostAction,
  createAudienceAction,
  createSpecializedMetaDraftAction,
  deleteAdDraftAction,
  deleteAudienceAction,
  deleteCampaignDraftAction,
  deleteCampaignLeavingPlatformAction,
  deletePlatformCampaignAction,
  draftAdAction,
  draftCampaignAction,
  duplicateAdAction,
  duplicateCampaignAction,
  pushAdAction,
  removePlatformAdAction,
  listAdsDestinations,
  listPixelsAction,
  setupMetaPixelAction,
  setTrackingDefaultsAction,
  importCreativeAction,
  linkAudienceAction,
  createGoogleAdsAccountAction,
  createReportingConversionAction,
  createLeadFormAction,
  listLeadFormsAction,
  listCampaignsAction,
  ideaHomePhotosAction,
  ideaContextAction,
  openCampaignAction,
  planPlatformAction,
  previewAdAction,
  pullPlatformAudiencesAction,
  pushDraftAction,
  setCreativePoolAction,
  setDeliveryAction,
  setPlatformDraftAction,
  setDeliveryGroupAction,
  deleteDeliveryGroupAction,
  topAds,
  updateAudienceAction,
  writeGoogleTextAdsAction,
  setAdPlatformsAction,
  setAdStatusAction,
  returnAdToStudioAction,
  setAdCopyAction,
  saveIdeaAction,
  addAdShellAction,
  createAdsFromAssetsAction,
  setAdHomeAction,
  setHomeHeroAction,
  catalogHomeFactsAction,
  suggestCampaignAudiencesAction,
  editCatalogCardAction,
  attachAdSetAction,
  replaceAdCardAction,
  setPlacementCopyAction,
  clearPlacementAction,
  freezePlacementAction,
  unfreezePlacementAction,
} from "./ads";
import {
  catalogStateAction,
  importWanderOsAction,
  wanderOsImportStatusAction,
  catalogWriteStatusAction,
  deleteCatalogExportAction,
  exportCatalogAction,
  newCatalogCopyAction,
  newCatalogPhotoAction,
  refreshCatalogHomesAction,
  setCatalogApprovalAction,
  setCatalogDefaultTemplateAction,
  setCatalogAdCopyAction,
  writeCatalogAdCopyAction,
  setCatalogIncludedAction,
} from "./catalog";
import { diagnoseAlignment } from "./alignment";
import { AMPLIFICATION_TOOLS } from "./amplification";
import {
  assignPersonaAudienceAction,
  createPersona,
  createPersonaLookalikeAction,
  deletePersona,
  listPersonas,
  suggestPersonas,
  wanderOsResearchContext,
  updatePersona,
} from "./personas";
import { getBrandMap } from "./brand-map";
import {
  createBrandAction,
  enrichBrandAction,
  listBrands,
  getBrand,
  createProspectAction,
  setBrandRelationshipAction,
  setBrandMarkAction,
  readBrandIdentityAction,
  recommendBrandMarkAction,
  addBrandAdPreviewAction,
  setPerformanceSettingsAction,
  updateBrandAction,
  updateBrandStoryAction,
} from "./brands";
import {
  suggestBrandMarketsAction,
  setBrandMarketsAction,
} from "./brand-context";
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
  setPlatformPostPublishSettings,
  setPlatformPostThread,
  upcomingContent,
  updateContentWorkItem,
} from "./content";
import {
  browseDrive,
  driveConnectionStatus,
  importDriveFilesToContent,
  readDriveDocument,
} from "./drive";
import { EMAIL_TOOLS } from "./email";
import { leadsRewriteSequence, leadsSequence, leadsSummary } from "./leads";
import { recentMentions } from "./listening";
import { importBrowserEvidence, getBrowserEvidence } from "./browser-evidence";
import { nextForBrand } from "./next";
import {
  analyzeMediaAsset,
  analyzeTimelineVideo,
  setBrandMix,
  setChannelCadence,
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
  prepareLibraryUploads,
  finishLibraryUploads,
  scrapeBrandPosts,
  setSeriesCadence,
  syncBrandBlog,
  syncBrandWebsite,
  syncOwnedBrandContent,
  listListingPhotos,
  importListingPhotos,
} from "./operations";
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
  featuredHomesAction,
  updateHomeAction,
  suggestFeaturedHomesAction,
  reviewPortfolioAction,
  listIntakesAction,
  previewIntakeApplyAction,
  applyIntakeAction,
  verifyIntakeAccessAction,
  promoteToClientAction,
} from "./performance";
import { readWebPage, webSearch } from "./research";
import {
  listPartnerships,
  savePartnership,
  removePartnership,
} from "./influencer-partnerships";
import { growthDomainTool } from "./types";

export const creativeRead = growthDomainTool({
  description:
    "Read typed creative briefs and current documents for articles, emails, images and videos.",
  actions: {
    list: listCreativeDocuments,
    get: readCreativeDocument,
    exportArticle: exportArticleAction,
    articleHistory: articleHistoryAction,
    articleRevision: articleRevisionAction,
  },
});
export const creativeWrite = growthDomainTool({
  description:
    "Prepare, edit and produce typed creative documents; explicitly transfer article drafts to or from Dato.",
  actions: {
    acceptCurrentArticle: acceptCurrentArticleAction,
    acceptArticle: acceptArticleAction,
    restoreArticle: restoreArticleAction,
    dismissArticle: dismissArticleAction,
    create: createCreativeDocumentAction,
    save: saveCreativeDocumentAction,
    select: selectCreativeDocumentAction,
    produce: produceCreativeDocument,
    cancel: cancelCreativeDocumentRun,
    pullDato: pullCreativeDato,
    pushDato: pushCreativeDato,
  },
});
export const workbookRead = growthDomainTool({
  description: "Inspect content workbooks, mappings and applied receipts.",
  actions: {
    list: workbookListAction,
    get: workbookGetAction,
    options: workbookOptionsAction,
  },
});
export const workbookWrite = growthDomainTool({
  description:
    "Import, edit and apply reviewed workbooks into native content drafts.",
  actions: {
    import: workbookImportAction,
    save: workbookSaveAction,
    apply: workbookApplyAction,
  },
});
export const referenceBoardRead = growthDomainTool({
  description:
    "Read brand reference boards, visual sources and creative proposals.",
  actions: {
    list: listBoardsAction,
    get: readBoardAction,
    media: boardMediaAction,
  },
});
export const referenceBoardWrite = growthDomainTool({
  description:
    "Capture references, shape proposals and accept one local draft.",
  actions: {
    save: saveBoardAction,
    addReference: addBoardReferenceAction,
    editReferences: editBoardReferencesAction,
    saveProposal: saveBoardProposalAction,
    acceptProposal: acceptBoardProposalAction,
  },
});
export const initiativeRead = growthDomainTool({
  description:
    "Read workspace initiatives and their organic and paid membership.",
  actions: {
    list: listInitiativesAction,
    get: getInitiativeAction,
    options: initiativeOptionsAction,
  },
});
export const initiativeWrite = growthDomainTool({
  description:
    "Manage optional initiative groupings. Work remains brand-owned; no provider changes.",
  actions: {
    save: saveInitiativeAction,
    link: linkInitiativeAction,
    unlink: unlinkInitiativeAction,
  },
});
export const brandRead = growthDomainTool({
  description: "Read brands, their mapped surfaces, and the next useful move.",
  actions: {
    list: listBrands,
    get: getBrand,
    getMap: getBrandMap,
    next: nextForBrand,
    identity: readBrandIdentityAction,
    suggestMarkets: suggestBrandMarketsAction,
    recommendMark: recommendBrandMarkAction,
  },
});

export const brandWrite = growthDomainTool({
  description:
    "Create an owned brand and update its identity or settings; update sets plain brand fields such as the hero. Create first, enrich second. Brand offboarding is available in the brand settings UI.",
  actions: {
    create: createBrandAction,
    createProspect: createProspectAction,
    setRelationship: setBrandRelationshipAction,
    enrich: enrichBrandAction,
    setMark: setBrandMarkAction,
    addAdPreview: addBrandAdPreviewAction,
    setPerformanceSettings: setPerformanceSettingsAction,
    update: updateBrandAction,
    updateStory: updateBrandStoryAction,
    setMarkets: setBrandMarketsAction,
    prepareEmailDns: prepareEmailDnsAction,
    recheckEmailDns: recheckEmailDnsAction,
    replaceEmailDnsLink: replaceEmailDnsLinkAction,
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
    reportWorkspace: reportWorkspaceAction,
    reviewReport: reviewReportAction,
    pitch: getPitchAction,
    draftPitch: draftPitchAction,
    list: listPerformanceAccountsAction,
    get: getPerformanceAccountAction,
    searchAttachableCampaigns: searchAttachableCampaignsAction,
    sponsoredAbandonment: listSponsoredAbandonmentAction,
    clientCampaignContext: clientCampaignContextAction,
    featuredHomes: featuredHomesAction,
    homeGroups: homeGroupsAction,
    launchChecklist: launchChecklistAction,
    bookingTargets: bookingTargetsAction,
    bookingTargetAvailability: bookingTargetAvailabilityAction,
    suggestFeaturedHomes: suggestFeaturedHomesAction,
    reviewPortfolio: reviewPortfolioAction,
    intakes: listIntakesAction,
    previewIntakeApply: previewIntakeApplyAction,
  },
});

export const performanceWrite = growthDomainTool({
  description:
    "Manage Performance accounts: onboard clients, create and edit named home groups and their membership, add their homes, update one home at a time (featured on the Setup page, hero photo), open and update billing cycles, and attach existing delivery (campaigns, lifecycle campaigns, amplification targets) to a cycle. Never creates ads or sends anything.",
  actions: {
    saveReportDraft: saveReportDraftAction,
    publishReport: publishReportAction,
    revokeReportShare: revokeReportShareAction,
    savePitch: savePitchAction,
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
    updateHome: updateHomeAction,
    saveHomeGroup: saveHomeGroupAction,
    recordLaunchChecklist: recordLaunchChecklistAction,
    changeHomeGroupHomes: changeHomeGroupHomesAction,
    deleteHomeGroup: deleteHomeGroupAction,
    setPrimaryHomeGroup: setPrimaryHomeGroupAction,
    saveBookingTarget: saveBookingTargetAction,
    attachBookingTarget: attachBookingTargetAction,
    groupOpenHomes: groupOpenHomesAction,
    setWanderOsEnabled: setWanderOsEnabledAction,
  },
});

export const personaRead = growthDomainTool({
  description:
    "Read a brand's personas — the stable 'who we talk to' layer that inspires campaign audiences and content.",
  actions: {
    list: listPersonas,
    suggest: suggestPersonas,
    wanderOsContext: wanderOsResearchContext,
  },
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
    "Check Google Drive connection status, browse the operator's Drive, and read a Doc, Sheet or Slides file as text.",
  actions: {
    status: driveConnectionStatus,
    browse: browseDrive,
    readDocument: readDriveDocument,
  },
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
    setPublishSettings: setPlatformPostPublishSettings,
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
  description:
    "Read email drafts, executable sequences and delivery status, and preview warehouse recipient audiences.",
  actions: {
    previewBroadcasts,
    broadcastStatus,
    listSequences,
    getSequence,
    sequenceEmails,
    sequenceStatus,
    previewSequence,
    get: EMAIL_TOOLS.getEmailDraft,
    previewOptions: emailPreviewOptionsAction,
    listTemplates: EMAIL_TOOLS.listEmailTemplates,
    audiences: listEmailAudiencesAction,
    previewAudience: previewEmailAudienceAction,
  },
});

export const emailWrite = growthDomainTool({
  description:
    "Plan and edit email content, audiences and sequences; manage sequence delivery with explicit approval for actions that can send.",
  actions: {
    prepareBroadcast,
    scheduleBroadcasts: scheduleBroadcastsAction,
    pauseBroadcast: pauseBroadcastAction,
    recoverBroadcast: recoverBroadcastAction,
    saveSequence,
    archiveSequence,
    prepareSequence,
    activateSequence,
    pauseSequence,
    enrollSequence,
    recoverSequence,
    cancelSequenceEnrollment,
    addAudienceMembers: addEmailAudienceMembersAction,
    importList: importEmailListAction,
    saveAudience: saveEmailAudienceAction,
    setSenderIdentity: EMAIL_TOOLS.setEmailSenderIdentity,
    createSlot: EMAIL_TOOLS.createEmailSlot,
    sharePreview: shareEmailPreviewAction,
    createDigestFromRow: EMAIL_TOOLS.createDigestFromRow,
    draftFromTemplate: EMAIL_TOOLS.draftEmailFromTemplate,
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
    listPixels: listPixelsAction,
    listLeadForms: listLeadFormsAction,
    openCampaign: openCampaignAction,
    previewAdditions: previewMetaAdditionsAction,
    refreshMeta: refreshMetaCampaignAction,
    listCampaigns: listCampaignsAction,
    ideaHomePhotos: ideaHomePhotosAction,
    ideaContext: ideaContextAction,
    catalogHomeFacts: catalogHomeFactsAction,
    catalogState: catalogStateAction,
    wanderOsImportStatus: wanderOsImportStatusAction,
    catalogWriteStatus: catalogWriteStatusAction,
    suggestCampaignAudiences: suggestCampaignAudiencesAction,
    previewAd: previewAdAction,
    diagnoseAlignment,
    inspectConversions: inspectConversionReality,
  },
});

export const adsWrite = growthDomainTool({
  description:
    "Build paid campaigns as local drafts, then planPlatform, setPlatformDraft and push with operator approval. Google push creates then pauses, so a failed pause may leave it live. Specialized Meta goals use createSpecializedMetaDraft. Custom audience operations, boosting and delivery changes require approval. boostMetaPost starts spend immediately.",
  actions: {
    draftCampaign: draftCampaignAction,
    draftAd: draftAdAction,
    writeGoogleTextAds: writeGoogleTextAdsAction,
    setAdPlatforms: setAdPlatformsAction,
    setAdStatus: setAdStatusAction,
    returnToStudio: returnAdToStudioAction,
    setAdCopy: setAdCopyAction,
    saveIdea: saveIdeaAction,
    addAdShell: addAdShellAction,
    createAdsFromAssets: createAdsFromAssetsAction,
    setAdHome: setAdHomeAction,
    setHomeHero: setHomeHeroAction,
    editCatalogCard: editCatalogCardAction,
    refreshCatalogHomes: refreshCatalogHomesAction,
    importWanderOs: importWanderOsAction,
    newCatalogCopy: newCatalogCopyAction,
    newCatalogPhoto: newCatalogPhotoAction,
    setCatalogApproval: setCatalogApprovalAction,
    setCatalogIncluded: setCatalogIncludedAction,
    setCatalogDefaultTemplate: setCatalogDefaultTemplateAction,
    setCatalogAdCopy: setCatalogAdCopyAction,
    writeCatalogAdCopy: writeCatalogAdCopyAction,
    exportCatalog: exportCatalogAction,
    deleteCatalogExport: deleteCatalogExportAction,
    attachAdSet: attachAdSetAction,
    replaceAdCard: replaceAdCardAction,
    setPlacementCopy: setPlacementCopyAction,
    clearPlacement: clearPlacementAction,
    freezePlacement: freezePlacementAction,
    unfreezePlacement: unfreezePlacementAction,
    addAudience: addAudienceAction,
    updateAudience: updateAudienceAction,
    planPlatform: planPlatformAction,
    setCreativePool: setCreativePoolAction,
    setPlatformDraft: setPlatformDraftAction,
    setDeliveryGroup: setDeliveryGroupAction,
    addDeliveryGroup: addDeliveryGroupAction,
    publishAdditions: publishMetaAdditionsAction,
    deleteDeliveryGroup: deleteDeliveryGroupAction,
    attachCampaign: attachCampaignAction,
    importMetaCampaign: importMetaCampaignAction,
    pullPlatformAudiences: pullPlatformAudiencesAction,
    linkAudience: linkAudienceAction,
    createReportingConversion: createReportingConversionAction,
    createGoogleAdsAccount: createGoogleAdsAccountAction,
    setupMetaPixel: setupMetaPixelAction,
    setTrackingDefaults: setTrackingDefaultsAction,
    createLeadForm: createLeadFormAction,
    importCreative: importCreativeAction,
    deleteCampaignDraft: deleteCampaignDraftAction,
    deleteCampaignLeavingPlatform: deleteCampaignLeavingPlatformAction,
    deleteAudience: deleteAudienceAction,
    deleteAdDraft: deleteAdDraftAction,
    push: pushDraftAction,
    pushAd: pushAdAction,
    removePlatformAd: removePlatformAdAction,
    setDelivery: setDeliveryAction,
    deletePlatformCampaign: deletePlatformCampaignAction,
    createSpecializedMetaDraft: createSpecializedMetaDraftAction,
    createAudience: createAudienceAction,
    createPersonaLookalike: createPersonaLookalikeAction,
    assignPersonaAudience: assignPersonaAudienceAction,
    boostMetaPost: boostMetaPostAction,
    duplicateCampaign: duplicateCampaignAction,
    duplicateAd: duplicateAdAction,
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
    "Save operator-pasted chat media, upload local image and video files (prepareUpload → PUT → finishUpload), import listing photos, discover website image suggestions, and approve or reject suggestions for an owned brand's media library. Website discovery does not approve images or update pitches.",
  actions: {
    saveChatMedia: saveChatMediaToLibrary,
    prepareUpload: prepareLibraryUploads,
    finishUpload: finishLibraryUploads,
    importListingPhotos,
    discoverWebsiteImages: discoverMediaSuggestionsAction,
    reviewWebsiteImage: reviewMediaSuggestionAction,
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
  actions: {
    list: listMediaLibrary,
    listingPhotos: listListingPhotos,
    suggestions: listMediaSuggestionsAction,
  },
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
    setChannelCadence,
    setSeriesCadence,
    setBrandMix,
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

export const influencerRead = growthDomainTool({
  description:
    "Read influencer partnerships and their tagged booking destinations.",
  actions: { partnerships: listPartnerships },
});
export const influencerWrite = growthDomainTool({
  description:
    "Create, edit and delete influencer partnerships without sending messages or making bookings.",
  actions: { savePartnership, removePartnership },
});

export const amplificationRead = growthDomainTool({
  description:
    "Read the amplifier rolodex with per-contact ask history — who can boost a post and how reliably they deliver.",
  actions: {
    list: AMPLIFICATION_TOOLS.listAmplifiers,
    targets: AMPLIFICATION_TOOLS.readAmplificationTargets,
  },
});

export const amplificationWrite = growthDomainTool({
  description:
    "Create and update private workspace amplifier contacts, including influencers, or plan amplification for a specific platform post. Contact creation needs only a name and creates no brand. Explicitly notify one human through Slack only when approved.",
  actions: {
    request: AMPLIFICATION_TOOLS.requestAmplification,
    saveContact: AMPLIFICATION_TOOLS.saveAmplifier,
    update: AMPLIFICATION_TOOLS.updateAmplification,
    createOutput: AMPLIFICATION_TOOLS.createAmplificationOutput,
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
  actions: { recent: recentMentions, browserRuns: getBrowserEvidence },
});

export const listeningWrite = growthDomainTool({
  description:
    "Record manual browser listening evidence in brand-scoped audit artifacts.",
  actions: { importBrowserRun: importBrowserEvidence },
});

export const reviewRead = growthDomainTool({
  description:
    "Internal review discussions on ads, catalog cards and content posts.",
  actions: { listComments: listReviewCommentsAction },
});
export const reviewWrite = growthDomainTool({
  description:
    "Internal review comments with explicit user or agent attribution.",
  actions: {
    addComment: addReviewCommentAction,
    deleteComment: deleteReviewCommentAction,
  },
});

export const seedRead = growthDomainTool({
  description:
    "Read a brand's seed lists, what built them and where each stands on Meta, without exposing contacts.",
  actions: {
    list: listSeedsAction,
    deliveries: seedDeliveriesAction,
    assetStatus: seedAssetStatusAction,
  },
});
export const seedWrite = growthDomainTool({
  description:
    "Seed lists: build one from a template (the brand's own past bookers or an email list; Wander travelers by towns, similar homes, a persona or a description), upload it to Meta (Wander's account for Wander travelers, otherwise the brand's own), build a lookalike, record the share with the client's account, then attach it to a campaign audience or persona.",
  actions: {
    build: buildSeedAction,
    refresh: refreshSeedAction,
    upload: uploadSeedAction,
    lookalike: seedLookalikeAction,
    share: shareSeedLookalikeAction,
    attach: attachSeedAssetAction,
  },
});

export const DOMAIN_CAPABILITY_TOOLS = {
  workbookRead,
  workbookWrite,
  referenceBoardRead,
  referenceBoardWrite,
  seedRead,
  seedWrite,
  reviewRead,
  reviewWrite,
  creativeRead,
  creativeWrite,
  initiativeRead,
  initiativeWrite,
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
  planningRead,
  planningWrite,
  amplificationRead,
  amplificationWrite,
  influencerRead,
  influencerWrite,
  leadsRead,
  leadsWrite,
  listeningRead,
  listeningWrite,
  playbookRead,
} as const;
