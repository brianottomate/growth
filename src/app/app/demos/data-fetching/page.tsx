import { TRPCExamples } from "./trpc-examples";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * DATA FETCHING BEST PRACTICES (tRPC)
 *
 * This demo showcases type-safe data fetching patterns using tRPC:
 * - Queries (fetching data)
 * - Mutations (creating/updating data)
 * - Optimistic updates
 * - Error handling
 * - Loading states
 * - Cache invalidation
 */

export default function DataFetchingDemo() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8">
        <h1 className="mb-2 text-4xl font-bold">Data Fetching Demo (tRPC)</h1>
        <p className="text-muted-foreground">
          Type-safe API calls with tRPC, TanStack Query, and React 19 features
        </p>
      </div>

      {/* Pattern Explanation */}
      <Card className="border-primary mb-8">
        <CardHeader>
          <CardTitle>Key Concepts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="mb-2 font-semibold">🎯 tRPC Benefits:</h3>
            <ul className="text-muted-foreground ml-4 list-inside list-disc space-y-1 text-sm">
              <li>
                <strong>End-to-end type safety</strong> - TypeScript types
                shared between client and server
              </li>
              <li>
                <strong>No code generation</strong> - Types inferred
                automatically
              </li>
              <li>
                <strong>Excellent DX</strong> - Autocomplete, type checking,
                refactoring support
              </li>
              <li>
                <strong>Built on React Query</strong> - Caching, refetching,
                optimistic updates
              </li>
              <li>
                <strong>No API routes needed</strong> - Direct function calls
                with type safety
              </li>
            </ul>
          </div>
          <div>
            <h3 className="mb-2 font-semibold">✅ Best Practices:</h3>
            <ul className="text-muted-foreground ml-4 list-inside list-disc space-y-1 text-sm">
              <li>Use queries for GET operations (data fetching)</li>
              <li>Use mutations for POST/PUT/DELETE (data modification)</li>
              <li>Implement optimistic updates for instant feedback</li>
              <li>Handle loading and error states appropriately</li>
              <li>Invalidate queries after mutations to refetch data</li>
              <li>Use suspense mode for simpler loading states</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* tRPC Examples */}
      <TRPCExamples />

      {/* Code Pattern */}
      <section className="mt-8">
        <h2 className="mb-4 text-2xl font-bold">Code Pattern</h2>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">
              1. Define tRPC Router (Server)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted overflow-x-auto rounded-lg p-4 text-xs">
              {`// server/api/routers/postRouter.ts
import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { postTable } from "@/server/db/schema";

export const postRouter = createTRPCRouter({
  // Query - fetch all posts
  getAll: publicProcedure.query(async ({ ctx }) => {
    return await ctx.db.select().from(postTable);
  }),

  // Query with input - fetch single post
  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return await ctx.db
        .select()
        .from(postTable)
        .where(eq(postTable.id, input.id))
        .limit(1);
    }),

  // Mutation - create post
  create: publicProcedure
    .input(z.object({
      title: z.string().min(1),
      content: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [post] = await ctx.db
        .insert(postTable)
        .values(input)
        .returning();
      return post;
    }),

  // Mutation - delete post
  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(postTable)
        .where(eq(postTable.id, input.id));
      return { success: true };
    }),
});`}
            </pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              2. Use tRPC in Client Component
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted overflow-x-auto rounded-lg p-4 text-xs">
              {`"use client";

import { api } from "@/trpc/react";
import { toast } from "sonner";

export function PostList() {
  // ✅ Query - fetch data
  const { data: posts, isLoading, error } = api.post.getAll.useQuery();

  // ✅ Mutation - modify data
  const utils = api.useUtils();
  const createPost = api.post.create.useMutation({
    onSuccess: () => {
      // Invalidate and refetch
      utils.post.getAll.invalidate();
      toast.success("Post created!");
    },
  });

  const deletePost = api.post.delete.useMutation({
    // Optimistic update
    onMutate: async (deletedPost) => {
      await utils.post.getAll.cancel();
      const previousPosts = utils.post.getAll.getData();

      utils.post.getAll.setData(undefined, (old) =>
        old?.filter((p) => p.id !== deletedPost.id)
      );

      return { previousPosts };
    },
    onError: (err, deletedPost, context) => {
      // Rollback on error
      utils.post.getAll.setData(undefined, context?.previousPosts);
    },
    onSettled: () => {
      utils.post.getAll.invalidate();
    },
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      {posts?.map((post) => (
        <div key={post.id}>
          <h3>{post.title}</h3>
          <button onClick={() => deletePost.mutate({ id: post.id })}>
            Delete
          </button>
        </div>
      ))}

      <button
        onClick={() =>
          createPost.mutate({
            title: "New Post",
            content: "Content here",
          })
        }
      >
        Create Post
      </button>
    </div>
  );
}`}
            </pre>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
