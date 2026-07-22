import "server-only";

import { adsScope, topAds } from "./ads";
import { diagnoseAlignment } from "./alignment";
import {
  createAudienceTarget,
  listAudienceTargets,
  saveAudienceTargets,
  updateAudienceActivation,
  updateAudienceTarget,
} from "./audiences";
import { getBrandMap } from "./brand-map";
import { listBrands } from "./brands";
import { CONTENT_STRATEGY_TOOLS } from "./content-strategy";
import { inspectConversionReality } from "./conversions";
import {
  addContentCrossPost,
  attachChatImageToContent,
  attachLibraryMediaToContent,
  contentPipelineSummary,
  createIdea,
  createPlatformPost,
  getContentWorkItem,
  productionQueue,
  promotePlatformPost,
  recoverArchiveMediaToContent,
  suggestMediaForContent,
  upcomingContent,
  updateContentWorkItem,
} from "./content";
import { EMAIL_TOOLS } from "./email";
import { leadsSummary } from "./leads";
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
  scrapeBrandPosts,
  setSeriesCadence,
  syncBrandBlog,
  syncBrandWebsite,
  syncOwnedBrandContent,
  updateBrandMix,
  updateChannelCadence,
} from "./operations";
import { PLANNING_TOOLS } from "./planning";
import {
  assignProductStorefrontManager,
  confirmProductStorefrontCurrent,
  copySiblingStorefrontContent,
  createProductAtlasProduct,
  createProductStorefront,
  listProductAtlasProducts,
  listProductStorefronts,
  markProductStorefrontStale,
  readProductAtlas,
  readProductStorefront,
  updateProductAtlas,
  updateProductStorefront,
} from "./product-storefront";
import { readWebPage, webSearch } from "./research";
import { growthDomainTool } from "./types";

export const brandRead = growthDomainTool({
  description: "Read brands, their mapped surfaces, and the next useful move.",
  actions: { list: listBrands, getMap: getBrandMap, next: nextForBrand },
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
  description: "List product storefronts or read one complete storefront.",
  actions: { list: listProductStorefronts, get: readProductStorefront },
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
  },
});

export const audienceRead = growthDomainTool({
  description: "Read strategic audience targets and activation state.",
  actions: { list: listAudienceTargets },
});

export const audienceWrite = growthDomainTool({
  description: "Create or update audience targets and planned activations.",
  actions: {
    createTarget: createAudienceTarget,
    saveTargets: saveAudienceTargets,
    updateTarget: updateAudienceTarget,
    updateActivation: updateAudienceActivation,
  },
});

export const researchRead = growthDomainTool({
  description:
    "Search the open web or read one known page as untrusted research evidence.",
  actions: { search: webSearch, readPage: readWebPage },
});

export const contentRead = growthDomainTool({
  description:
    "Read pipeline, upcoming, production, work-item, or media state.",
  actions: {
    pipeline: contentPipelineSummary,
    upcoming: upcomingContent,
    productionQueue,
    getWorkItem: getContentWorkItem,
    suggestMedia: suggestMediaForContent,
  },
});

export const contentWrite = growthDomainTool({
  description: "Create and refine canonical content work and platform posts.",
  actions: {
    createIdea,
    updateWorkItem: updateContentWorkItem,
    addCrossPost: addContentCrossPost,
    createPlatformPost,
    promotePlatformPost,
  },
});

export const contentMediaWrite = growthDomainTool({
  description: "Attach or recover media for canonical content work.",
  actions: {
    attachChatImage: attachChatImageToContent,
    attachLibraryMedia: attachLibraryMediaToContent,
    recoverArchiveMedia: recoverArchiveMediaToContent,
  },
});

export const emailRead = growthDomainTool({
  description: "Read one email draft.",
  actions: { get: EMAIL_TOOLS.getEmailDraft },
});

export const emailWrite = growthDomainTool({
  description: "Create, revise, or deliberately generate an email draft.",
  actions: {
    createSlot: EMAIL_TOOLS.createEmailSlot,
    createProductUpdate: EMAIL_TOOLS.createProductUpdateDraft,
    updateDraft: EMAIL_TOOLS.updateEmailDraft,
    generateDraft: EMAIL_TOOLS.generateEmailDraft,
  },
});

export const contentStrategyRead = growthDomainTool({
  description: "Read one brand's pillars, series, and grouping proposals.",
  actions: { get: CONTENT_STRATEGY_TOOLS.getContentStrategy },
});

export const contentStrategyWrite = growthDomainTool({
  description: "Save and organize one brand's content strategy structure.",
  actions: {
    savePillar: CONTENT_STRATEGY_TOOLS.saveContentPillar,
    saveSeries: CONTENT_STRATEGY_TOOLS.saveContentSeries,
    organizeIdeas: CONTENT_STRATEGY_TOOLS.organizeContentIdeas,
    proposeGroupings: proposeContentGroupings,
    resolveGrouping: CONTENT_STRATEGY_TOOLS.resolveContentGrouping,
  },
});

export const adsRead = growthDomainTool({
  description:
    "Read paid-ad scope and performance, diagnose intent alignment, or inspect conversion mappings.",
  actions: {
    scope: adsScope,
    top: topAds,
    diagnoseAlignment,
    inspectConversions: inspectConversionReality,
  },
});

export const publishingRead = growthDomainTool({
  description: "Read publishing connections or open one timeline post.",
  actions: {
    connections: listPublishingConnections,
    openTimelinePost,
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
  description: "Analyze an image or prepare durable storyboard video analysis.",
  actions: {
    analyzeImage: analyzeMediaAsset,
    prepareVideo: analyzeTimelineVideo,
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
    createCadence: createChannelCadence,
    updateCadence: updateChannelCadence,
    setSeriesCadence,
    createBrandMix,
    updateBrandMix,
  },
});

export const planningRead = growthDomainTool({
  description: "Preview slots or draft a reviewable content-moment blueprint.",
  actions: {
    previewSlots: PLANNING_TOOLS.previewTwoWeekSlots,
    draftMomentBlueprint: PLANNING_TOOLS.draftMomentBlueprint,
  },
});

export const planningWrite = growthDomainTool({
  description: "Generate slots or commit a reviewed moment blueprint.",
  actions: {
    generateSlots: PLANNING_TOOLS.generateTwoWeekSlots,
    commitMomentPlan: PLANNING_TOOLS.commitMomentPlan,
  },
});

export const leadsRead = growthDomainTool({
  description: "Read lead totals and current pipeline summary.",
  actions: { summary: leadsSummary },
});

export const listeningRead = growthDomainTool({
  description: "Read recent brand mentions and listening triage.",
  actions: { recent: recentMentions },
});

export const DOMAIN_CAPABILITY_TOOLS = {
  brandRead,
  productAtlasRead,
  productAtlasWrite,
  storefrontRead,
  storefrontWrite,
  audienceRead,
  audienceWrite,
  researchRead,
  contentRead,
  contentWrite,
  contentMediaWrite,
  emailRead,
  emailWrite,
  contentStrategyRead,
  contentStrategyWrite,
  adsRead,
  publishingRead,
  sourceSyncWrite,
  mediaAnalysisRead,
  mediaAnalysisWrite,
  strategyRead,
  strategyWrite,
  planningRead,
  planningWrite,
  leadsRead,
  listeningRead,
} as const;
