import { Suspense } from "react";
import { db } from "@/server/db";
import { postTable } from "@/server/db/schema";
import { desc } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * SERVER COMPONENT BEST PRACTICES
 *
 * Server Components (default in App Router):
 * - Can directly access backend resources (database, filesystem, etc.)
 * - Zero client-side JavaScript (better performance)
 * - Automatic code splitting
 * - Can use async/await at the component level
 * - Cannot use hooks like useState, useEffect
 * - Cannot use event handlers
 *
 * Use Server Components when:
 * - Fetching data
 * - Accessing backend resources directly
 * - Keeping sensitive logic on server (API keys, etc.)
 * - Reducing client bundle size
 */

// ============================================================
// PATTERN 1: Async Server Component with Direct DB Access
// ============================================================

async function RecentPosts() {
  // ✅ Direct database access in Server Component
  // No need for API routes for data fetching!
  const posts = await db
    .select()
    .from(postTable)
    .orderBy(desc(postTable.createdAt))
    .limit(5);

  if (posts.length === 0) {
    return (
      <div className="text-muted-foreground py-8 text-center">
        No posts found. Create your first post!
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <Card key={post.id}>
          <CardHeader>
            <CardTitle>{post.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground line-clamp-2 text-sm">
              {post.name}
            </p>
            <div className="text-muted-foreground mt-2 text-xs">
              Created: {new Date(post.createdAt).toLocaleDateString()}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ============================================================
// PATTERN 2: Loading States with Suspense Boundaries
// ============================================================

function PostsSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-6 w-3/4" />
          </CardHeader>
          <CardContent>
            <Skeleton className="mb-2 h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ============================================================
// PATTERN 3: Data Fetching with Intentional Delay (Demo)
// ============================================================

async function SlowLoadingData() {
  // Simulate slow data fetching (remove in production!)
  await new Promise((resolve) => setTimeout(resolve, 2000));

  return (
    <Card className="bg-primary/5">
      <CardHeader>
        <CardTitle className="text-sm">Slow Loading Component</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">
          This component intentionally takes 2 seconds to load, demonstrating
          Suspense boundaries and streaming.
        </p>
      </CardContent>
    </Card>
  );
}

// ============================================================
// PATTERN 4: Multiple Suspense Boundaries for Progressive Loading
// ============================================================

async function ServerStats() {
  // Simulate fetching some stats
  const userCount = Math.floor(Math.random() * 1000) + 100;
  const postCount = Math.floor(Math.random() * 500) + 50;

  return (
    <div className="grid grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Total Users</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{userCount}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Total Posts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{postCount}</div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// MAIN PAGE COMPONENT
// ============================================================

export default function ServerComponentsDemo() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8">
        <h1 className="mb-2 text-4xl font-bold">Server Components Demo</h1>
        <p className="text-muted-foreground">
          Examples of Server Component patterns with direct database access,
          Suspense boundaries, and streaming
        </p>
      </div>

      {/* Pattern Explanation */}
      <Card className="border-primary mb-8">
        <CardHeader>
          <CardTitle>Key Concepts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="mb-2 font-semibold">✅ Server Components Can:</h3>
            <ul className="text-muted-foreground ml-4 list-inside list-disc space-y-1 text-sm">
              <li>Access databases directly (no API routes needed)</li>
              <li>Use async/await at component level</li>
              <li>Keep sensitive data on server</li>
              <li>Reduce client bundle size</li>
              <li>Stream HTML progressively</li>
            </ul>
          </div>
          <div>
            <h3 className="mb-2 font-semibold">❌ Server Components Cannot:</h3>
            <ul className="text-muted-foreground ml-4 list-inside list-disc space-y-1 text-sm">
              <li>Use React hooks (useState, useEffect, etc.)</li>
              <li>Use browser APIs (localStorage, window, etc.)</li>
              <li>Handle event listeners (onClick, onChange, etc.)</li>
              <li>Use context providers that require client state</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Demo Sections */}
      <div className="space-y-8">
        {/* Section 1: Stats with Suspense */}
        <section>
          <h2 className="mb-4 text-2xl font-bold">1. Server-Side Statistics</h2>
          <p className="text-muted-foreground mb-4">
            Data fetched directly on the server, no client-side JS needed
          </p>
          <Suspense
            fallback={
              <div className="grid grid-cols-2 gap-4">
                <Skeleton className="h-32" />
                <Skeleton className="h-32" />
              </div>
            }
          >
            <ServerStats />
          </Suspense>
        </section>

        {/* Section 2: Recent Posts */}
        <section>
          <h2 className="mb-4 text-2xl font-bold">2. Database Query Results</h2>
          <p className="text-muted-foreground mb-4">
            Direct database access with Suspense boundary for loading state
          </p>
          <Suspense fallback={<PostsSkeleton />}>
            <RecentPosts />
          </Suspense>
        </section>

        {/* Section 3: Slow Loading (Streaming) */}
        <section>
          <h2 className="mb-4 text-2xl font-bold">
            3. Streaming with Suspense
          </h2>
          <p className="text-muted-foreground mb-4">
            Page shell loads immediately, slow components stream in when ready
          </p>
          <Suspense
            fallback={
              <Card>
                <CardContent className="py-8">
                  <div className="flex items-center justify-center">
                    <div className="border-primary h-8 w-8 animate-spin rounded-full border-b-2" />
                  </div>
                </CardContent>
              </Card>
            }
          >
            <SlowLoadingData />
          </Suspense>
        </section>

        {/* Code Examples */}
        <section>
          <h2 className="mb-4 text-2xl font-bold">Code Examples</h2>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Direct Database Access</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted overflow-x-auto rounded-lg p-4 text-xs">
                {`async function RecentPosts() {
  // ✅ Direct database query in Server Component
  const posts = await db
    .select()
    .from(postTable)
    .orderBy(desc(postTable.createdAt))
    .limit(5);

  return (
    <div>
      {posts.map(post => (
        <Card key={post.id}>
          <h3>{post.name}</h3>
          <p>{post.name}</p>
        </Card>
      ))}
    </div>
  );
}

// Usage with Suspense
<Suspense fallback={<Skeleton />}>
  <RecentPosts />
</Suspense>`}
              </pre>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
