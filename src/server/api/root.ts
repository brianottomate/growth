import { emailSequenceRouter } from "@/server/api/routers/email-sequence.router";
import { workflowRouter } from "./routers/workflow.router";
import { initiativeRouter } from "@/server/api/routers/initiative.router";
import { homeGroupsRouter } from "@/server/api/routers/homeGroups.router";
import { userRouter } from "@/server/api/routers/user.router";
import { adsRouter } from "@/server/api/routers/ads.router";
import { affiliateRouter } from "@/server/api/routers/affiliate.router";
import { amplifierRouter } from "@/server/api/routers/amplifier.router";
import { personaRouter } from "@/server/api/routers/persona.router";
import { googleDriveRouter } from "@/server/api/routers/googleDrive.router";
import { brandRouter } from "@/server/api/routers/brand.router";
import { blogRouter } from "@/server/api/routers/blog.router";
import { cadenceRouter } from "@/server/api/routers/cadence.router";
import { catalogRouter } from "@/server/api/routers/catalog.router";
import { channelRouter } from "@/server/api/routers/channel.router";
import { channelSuggestionRouter } from "@/server/api/routers/channelSuggestion.router";
import { contentRouter } from "@/server/api/routers/content.router";
import { contentSuggestionRouter } from "@/server/api/routers/contentSuggestion.router";
import { contentAnalysisRouter } from "@/server/api/routers/contentAnalysis.router";
import { compositionRouter } from "@/server/api/routers/composition.router";
import { creativeWorkRouter } from "@/server/api/routers/creativeWork.router";
import { conversionRouter } from "@/server/api/routers/conversion.router";
import { inboxRouter } from "@/server/api/routers/inbox.router";
import { campaignRouter } from "@/server/api/routers/campaign.router";
import { newsletterRouter } from "@/server/api/routers/newsletter.router";
import { orgRouter } from "@/server/api/routers/org.router";
import { outreachRouter } from "@/server/api/routers/outreach.router";
import { performanceRouter } from "@/server/api/routers/performance.router";
import { productStorefrontRouter } from "@/server/api/routers/productStorefront.router";
import { instantlyRouter } from "@/server/api/routers/instantly.router";
import { leadsRouter } from "@/server/api/routers/leads.router";
import { lifecycleRouter } from "@/server/api/routers/lifecycle.router";
import { pregenNativeRouter } from "@/server/api/routers/pregen-native.router";
import { transactionalRouter } from "@/server/api/routers/transactional.router";
import { listeningRouter } from "@/server/api/routers/listening.router";
import { mediaRouter } from "@/server/api/routers/media.router";
import { mentionRouter } from "@/server/api/routers/mention.router";
import { redditRouter } from "@/server/api/routers/reddit.router";
import { rescheduleRouter } from "@/server/api/routers/reschedule.router";
import { seriesRouter } from "@/server/api/routers/series.router";
import { spendRouter } from "@/server/api/routers/spend.router";
import { studioRouter } from "@/server/api/routers/studio.router";
import { twitterRouter } from "@/server/api/routers/twitter.router";
import { websiteRouter } from "@/server/api/routers/website.router";
import { zernioRouter } from "@/server/api/routers/zernio.router";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = {
  workflow: workflowRouter,
  initiative: initiativeRouter,
  homeGroups: homeGroupsRouter,
  user: userRouter,
  ads: adsRouter,
  affiliate: affiliateRouter,
  amplifier: amplifierRouter,
  persona: personaRouter,
  brand: brandRouter,
  blog: blogRouter,
  cadence: cadenceRouter,
  catalog: catalogRouter,
  channel: channelRouter,
  channelSuggestion: channelSuggestionRouter,
  content: contentRouter,
  googleDrive: googleDriveRouter,
  contentSuggestion: contentSuggestionRouter,
  contentAnalysis: contentAnalysisRouter,
  composition: compositionRouter,
  creativeWork: creativeWorkRouter,
  conversion: conversionRouter,
  inbox: inboxRouter,
  campaign: campaignRouter,
  newsletter: newsletterRouter,
  org: orgRouter,
  outreach: outreachRouter,
  performance: performanceRouter,
  productStorefront: productStorefrontRouter,
  instantly: instantlyRouter,
  leads: leadsRouter,
  lifecycle: lifecycleRouter,
  emailSequence: emailSequenceRouter,
  pregenNative: pregenNativeRouter,
  transactional: transactionalRouter,
  listening: listeningRouter,
  media: mediaRouter,
  mention: mentionRouter,
  reddit: redditRouter,
  reschedule: rescheduleRouter,
  series: seriesRouter,
  spend: spendRouter,
  studio: studioRouter,
  twitter: twitterRouter,
  website: websiteRouter,
  zernio: zernioRouter,
};

// export type definition of API
export type AppRouter = typeof appRouter;
