"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * tRPC EXAMPLES
 *
 * Demonstrates various tRPC patterns:
 * - Queries (useQuery)
 * - Mutations (useMutation)
 * - Optimistic updates
 * - Cache invalidation
 */

export function TRPCExamples() {
  return (
    <div className="space-y-8">
      <QueryExample />
      <MutationExample />
      <OptimisticUpdateExample />
    </div>
  );
}

// ============================================================
// EXAMPLE 1: Basic Query (Fetching Data)
// ============================================================

function QueryExample() {
  const trpc = useTRPC();
  const {
    data: posts,
    isLoading,
    error,
    refetch,
  } = useQuery(trpc.post.all.queryOptions());

  return (
    <section>
      <h2 className="mb-4 text-2xl font-bold">1. Basic Query (useQuery)</h2>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Fetching Blog Posts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {isLoading && (
              <div className="space-y-2">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            )}

            {error && (
              <div className="bg-destructive/10 text-destructive rounded-lg p-4">
                Error loading posts: {error.message}
              </div>
            )}

            {posts?.length === 0 && (
              <div className="text-muted-foreground py-8 text-center">
                No posts found. Create one using the mutation example below!
              </div>
            )}

            {posts && posts.length > 0 && (
              <div className="space-y-2">
                {posts.slice(0, 5).map((post) => (
                  <div
                    key={post.id}
                    className="hover:bg-muted/50 rounded-lg border p-3 transition-colors"
                  >
                    <h4 className="font-semibold">{post.name}</h4>
                    <div className="text-muted-foreground mt-1 text-xs">
                      {new Date(post.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Button onClick={() => refetch()} variant="outline" size="sm">
              Refetch Posts
            </Button>
          </div>

          <p className="text-muted-foreground mt-4 text-sm">
            Uses{" "}
            <code className="bg-muted rounded px-1 py-0.5 text-xs">
              useQuery(trpc.post.all.queryOptions())
            </code>{" "}
            to fetch data with automatic caching and refetching
          </p>
        </CardContent>
      </Card>
    </section>
  );
}

// ============================================================
// EXAMPLE 2: Mutation (Creating/Updating Data)
// ============================================================

function MutationExample() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const createPost = useMutation(
    trpc.post.create.mutationOptions({
      onSuccess: () => {
        // Invalidate posts query to refetch
        void queryClient.invalidateQueries(trpc.post.all.queryOptions());
        toast.success("Post created successfully!");

        // Clear form
        setTitle("");
        setDescription("");
      },
      onError: (error) => {
        toast.error(`Failed to create post: ${error.message}`);
      },
    }),
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }

    createPost.mutate({
      title,
      description: description || undefined,
    });
  };

  return (
    <section>
      <h2 className="mb-4 text-2xl font-bold">2. Mutation (useMutation)</h2>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Create New Post</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="title" className="text-sm font-medium">
                Title *
              </label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter post title"
                disabled={createPost.isPending}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="description" className="text-sm font-medium">
                Description
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter post description (optional)"
                className="min-h-[100px] w-full rounded-md border px-3 py-2 disabled:opacity-50"
                disabled={createPost.isPending}
              />
            </div>

            <Button type="submit" disabled={createPost.isPending}>
              {createPost.isPending ? (
                <>
                  <span className="mr-2">Creating...</span>
                  <span className="animate-spin">⏳</span>
                </>
              ) : (
                "Create Post"
              )}
            </Button>
          </form>

          <p className="text-muted-foreground mt-4 text-sm">
            Uses{" "}
            <code className="bg-muted rounded px-1 py-0.5 text-xs">
              useMutation(trpc.post.create.mutationOptions())
            </code>{" "}
            with automatic query invalidation
          </p>
        </CardContent>
      </Card>
    </section>
  );
}

// ============================================================
// EXAMPLE 3: Optimistic Updates
// ============================================================

function OptimisticUpdateExample() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: posts } = useQuery(trpc.post.all.queryOptions());

  const deletePost = useMutation(
    trpc.post.delete.mutationOptions({
      // Optimistic update - update UI immediately before server responds
      onMutate: async (variables) => {
        // Cancel outgoing refetches
        await queryClient.cancelQueries(trpc.post.all.queryOptions());

        // Snapshot the previous value
        const previousPosts = queryClient.getQueryData(
          trpc.post.all.queryOptions().queryKey,
        );

        // Optimistically update to the new value
        queryClient.setQueryData(
          trpc.post.all.queryOptions().queryKey,
          (old) => {
            if (!old) return old;
            return old.filter((p) => p.id !== variables.id);
          },
        );

        // Return context with snapshot
        return { previousPosts };
      },

      // If mutation fails, rollback
      onError: (_err, _variables, context) => {
        if (context?.previousPosts) {
          queryClient.setQueryData(
            trpc.post.all.queryOptions().queryKey,
            context.previousPosts,
          );
        }
        toast.error("Failed to delete post");
      },

      // Always refetch after error or success
      onSettled: () => {
        void queryClient.invalidateQueries(trpc.post.all.queryOptions());
      },

      onSuccess: () => {
        toast.success("Post deleted!");
      },
    }),
  );

  return (
    <section>
      <h2 className="mb-4 text-2xl font-bold">3. Optimistic Updates</h2>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Delete Posts Instantly</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 space-y-2">
            {!posts || posts.length === 0 ? (
              <div className="text-muted-foreground py-8 text-center">
                No posts to delete. Create some posts first!
              </div>
            ) : (
              posts.slice(0, 5).map((post) => (
                <div
                  key={post.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex-1">
                    <h4 className="font-semibold">{post.name}</h4>
                  </div>
                  <Button
                    onClick={() => deletePost.mutate({ id: post.id })}
                    variant="destructive"
                    size="sm"
                    disabled={deletePost.isPending}
                  >
                    {deletePost.isPending ? "Deleting..." : "Delete"}
                  </Button>
                </div>
              ))
            )}
          </div>

          <div className="bg-muted space-y-2 rounded-lg p-3">
            <h4 className="text-sm font-semibold">How it works:</h4>
            <ul className="text-muted-foreground list-inside list-disc space-y-1 text-xs">
              <li>UI updates immediately when you click Delete (optimistic)</li>
              <li>Post is removed from list before server responds</li>
              <li>If server request fails, list is restored (rollback)</li>
              <li>Provides instant feedback for better UX</li>
            </ul>
          </div>

          <p className="text-muted-foreground mt-4 text-sm">
            Uses{" "}
            <code className="bg-muted rounded px-1 py-0.5 text-xs">
              onMutate
            </code>
            ,{" "}
            <code className="bg-muted rounded px-1 py-0.5 text-xs">
              onError
            </code>
            , and{" "}
            <code className="bg-muted rounded px-1 py-0.5 text-xs">
              onSettled
            </code>{" "}
            for optimistic UI
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
