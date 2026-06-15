import { userRouter } from "@/server/api/routers/user.router";
import { amplifierRouter } from "@/server/api/routers/amplifier.router";
import { audienceRouter } from "@/server/api/routers/audience.router";
import { brandRouter } from "@/server/api/routers/brand.router";
import { channelRouter } from "@/server/api/routers/channel.router";
import { channelSuggestionRouter } from "@/server/api/routers/channelSuggestion.router";
import { contentRouter } from "@/server/api/routers/content.router";
import { inboxRouter } from "@/server/api/routers/inbox.router";
import { initiativeRouter } from "@/server/api/routers/initiative.router";
import { newsletterRouter } from "@/server/api/routers/newsletter.router";
import { orgRouter } from "@/server/api/routers/org.router";
import { outreachRouter } from "@/server/api/routers/outreach.router";
import { instantlyRouter } from "@/server/api/routers/instantly.router";
import { leadsRouter } from "@/server/api/routers/leads.router";
import { lifecycleRouter } from "@/server/api/routers/lifecycle.router";
import { mediaRouter } from "@/server/api/routers/media.router";
import { mentionRouter } from "@/server/api/routers/mention.router";
import { momentRouter } from "@/server/api/routers/moment.router";
import { redditRouter } from "@/server/api/routers/reddit.router";
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
  amplifier: amplifierRouter,
  audience: audienceRouter,
  brand: brandRouter,
  channel: channelRouter,
  channelSuggestion: channelSuggestionRouter,
  content: contentRouter,
  inbox: inboxRouter,
  initiative: initiativeRouter,
  newsletter: newsletterRouter,
  org: orgRouter,
  outreach: outreachRouter,
  instantly: instantlyRouter,
  leads: leadsRouter,
  lifecycle: lifecycleRouter,
  media: mediaRouter,
  mention: mentionRouter,
  moment: momentRouter,
  reddit: redditRouter,
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
