import { z } from "zod";
import { eq } from "drizzle-orm";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/server/api/trpc";
import { postTable } from "@/server/db/schema";

export const postRouter = createTRPCRouter({
  hello: publicProcedure
    .input(z.object({ text: z.string() }))
    .query(({ input }) => {
      return {
        greeting: `Hello ${input.text}`,
      };
    }),

  // Get all posts (for demo purposes)
  all: publicProcedure.query(async ({ ctx }) => {
    const posts = await ctx.db.query.postTable.findMany({
      orderBy: (posts, { desc }) => [desc(posts.createdAt)],
      limit: 50,
    });
    return posts;
  }),

  // Create a post
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1),
        description: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [post] = await ctx.db
        .insert(postTable)
        .values({
          name: input.title,
          createdById: ctx.session.user.id,
        })
        .returning();

      return { ...post, description: input.description };
    }),

  // Delete a post
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(postTable).where(eq(postTable.id, input.id));

      return { success: true };
    }),

  getLatest: protectedProcedure.query(async ({ ctx }) => {
    const post = await ctx.db.query.postTable.findFirst({
      orderBy: (posts, { desc }) => [desc(posts.createdAt)],
    });

    return post ?? null;
  }),

  getSecretMessage: protectedProcedure.query(() => {
    return "you can now see this secret message!";
  }),
});
