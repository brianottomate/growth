import { postRouter } from "@/server/api/routers/post.router";
import { userRouter } from "@/server/api/routers/user.router";
import { blobRouter } from "@/server/api/routers/blob.router";
import { newsletterRouter } from "@/server/api/routers/newsletter.router";
import { orgRouter } from "@/server/api/routers/org.router";
import { outreachRouter } from "@/server/api/routers/outreach.router";
import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  post: postRouter,
  user: userRouter,
  blob: blobRouter,
  newsletter: newsletterRouter,
  org: orgRouter,
  outreach: outreachRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
