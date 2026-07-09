import { userRouter } from "@/server/api/routers/user.router";
import { adsRouter } from "@/server/api/routers/ads.router";
import { affiliateRouter } from "@/server/api/routers/affiliate.router";
import { amplifierRouter } from "@/server/api/routers/amplifier.router";
import { audienceRouter } from "@/server/api/routers/audience.router";
import { brandRouter } from "@/server/api/routers/brand.router";
import { cadenceRouter } from "@/server/api/routers/cadence.router";
import { channelRouter } from "@/server/api/routers/channel.router";
import { channelSuggestionRouter } from "@/server/api/routers/channelSuggestion.router";
import { contentRouter } from "@/server/api/routers/content.router";
import { conversionRouter } from "@/server/api/routers/conversion.router";
import { inboxRouter } from "@/server/api/routers/inbox.router";
import { initiativeRouter } from "@/server/api/routers/initiative.router";
import { newsletterRouter } from "@/server/api/routers/newsletter.router";
import { orgRouter } from "@/server/api/routers/org.router";
import { outreachRouter } from "@/server/api/routers/outreach.router";
import { planImportRouter } from "@/server/api/routers/planImport.router";
import { instantlyRouter } from "@/server/api/routers/instantly.router";
import { leadsRouter } from "@/server/api/routers/leads.router";
import { lifecycleRouter } from "@/server/api/routers/lifecycle.router";
import { listeningRouter } from "@/server/api/routers/listening.router";
import { mediaRouter } from "@/server/api/routers/media.router";
import { mentionRouter } from "@/server/api/routers/mention.router";
import { momentRouter } from "@/server/api/routers/moment.router";
import { redditRouter } from "@/server/api/routers/reddit.router";
import { rescheduleRouter } from "@/server/api/routers/reschedule.router";
import { studioRouter } from "@/server/api/routers/studio.router";
import { twitterRouter } from "@/server/api/routers/twitter.router";
import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  user: userRouter,
  ads: adsRouter,
  affiliate: affiliateRouter,
  amplifier: amplifierRouter,
  audience: audienceRouter,
  brand: brandRouter,
  cadence: cadenceRouter,
  channel: channelRouter,
  channelSuggestion: channelSuggestionRouter,
  content: contentRouter,
  conversion: conversionRouter,
  inbox: inboxRouter,
  initiative: initiativeRouter,
  newsletter: newsletterRouter,
  org: orgRouter,
  outreach: outreachRouter,
  planImport: planImportRouter,
  instantly: instantlyRouter,
  leads: leadsRouter,
  lifecycle: lifecycleRouter,
  listening: listeningRouter,
  media: mediaRouter,
  mention: mentionRouter,
  moment: momentRouter,
  reddit: redditRouter,
  reschedule: rescheduleRouter,
  studio: studioRouter,
  twitter: twitterRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.user.me();
 */
export const createCaller = createCallerFactory(appRouter);
