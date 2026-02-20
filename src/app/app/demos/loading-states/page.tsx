import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * LOADING & ERROR STATES BEST PRACTICES
 *
 * This demo showcases patterns for handling loading and error states:
 * - loading.tsx file convention
 * - error.tsx file convention
 * - Suspense boundaries
 * - Skeleton loaders
 * - Error boundaries
 */

// Slow loading component for demo
async function SlowComponent({ delay = 2000 }: { delay?: number }) {
  await new Promise((resolve) => setTimeout(resolve, delay));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Loaded Content</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">
          This content took {delay / 1000} seconds to load. The page shell was
          rendered immediately while this component streamed in.
        </p>
      </CardContent>
    </Card>
  );
}

// Component that might error
async function MaybeErrorComponent({ shouldError }: { shouldError: boolean }) {
  await new Promise((resolve) => setTimeout(resolve, 1000));

  if (shouldError) {
    throw new Error("This is a simulated error for demonstration");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Success!</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">
          No errors occurred. This component loaded successfully.
        </p>
      </CardContent>
    </Card>
  );
}

export default function LoadingStatesDemo() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8">
        <h1 className="mb-2 text-4xl font-bold">Loading & Error States Demo</h1>
        <p className="text-muted-foreground">
          Best practices for loading states, error handling, and Suspense
          boundaries
        </p>
      </div>

      {/* Pattern Explanation */}
      <Card className="border-primary mb-8">
        <CardHeader>
          <CardTitle>Key Concepts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="mb-2 font-semibold">🎯 Next.js Conventions:</h3>
            <ul className="text-muted-foreground ml-4 list-inside list-disc space-y-1 text-sm">
              <li>
                <strong>loading.tsx</strong> - Automatic loading UI for route
                segments
              </li>
              <li>
                <strong>error.tsx</strong> - Error boundary for route segments
              </li>
              <li>
                <strong>Suspense</strong> - Fine-grained loading boundaries
              </li>
              <li>
                <strong>Streaming</strong> - Progressive page rendering
              </li>
            </ul>
          </div>
          <div>
            <h3 className="mb-2 font-semibold">✅ Best Practices:</h3>
            <ul className="text-muted-foreground ml-4 list-inside list-disc space-y-1 text-sm">
              <li>Use loading.tsx for route-level loading states</li>
              <li>Use Suspense for granular loading boundaries</li>
              <li>Provide meaningful skeleton loaders</li>
              <li>Handle errors with error.tsx boundaries</li>
              <li>Show error recovery options (retry, go back)</li>
              <li>Stream expensive components separately</li>
              <li>Avoid blocking the entire page for slow data</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Demo Sections */}
      <div className="space-y-8">
        {/* Section 1: Basic Suspense */}
        <section>
          <h2 className="mb-4 text-2xl font-bold">
            1. Suspense with Skeleton Loader
          </h2>
          <p className="text-muted-foreground mb-4">
            Component streams in after 2 seconds while skeleton shows
            immediately
          </p>
          <Suspense
            fallback={
              <Card>
                <CardHeader>
                  <Skeleton className="h-5 w-32" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="mb-2 h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </CardContent>
              </Card>
            }
          >
            <SlowComponent delay={2000} />
          </Suspense>
        </section>

        {/* Section 2: Multiple Suspense Boundaries */}
        <section>
          <h2 className="mb-4 text-2xl font-bold">
            2. Multiple Independent Boundaries
          </h2>
          <p className="text-muted-foreground mb-4">
            Each component loads independently without blocking others
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <Suspense
              fallback={
                <Card>
                  <CardContent className="py-8">
                    <div className="flex justify-center">
                      <div className="border-primary h-8 w-8 animate-spin rounded-full border-b-2" />
                    </div>
                  </CardContent>
                </Card>
              }
            >
              <SlowComponent delay={1000} />
            </Suspense>

            <Suspense
              fallback={
                <Card>
                  <CardContent className="py-8">
                    <div className="flex justify-center">
                      <div className="border-primary h-8 w-8 animate-spin rounded-full border-b-2" />
                    </div>
                  </CardContent>
                </Card>
              }
            >
              <SlowComponent delay={3000} />
            </Suspense>
          </div>
        </section>

        {/* Section 3: Error Handling */}
        <section>
          <h2 className="mb-4 text-2xl font-bold">3. Error Handling</h2>
          <p className="text-muted-foreground mb-4">
            Errors are caught by error boundaries without crashing the page
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <Suspense
              fallback={
                <Card>
                  <CardContent className="py-8">
                    <div className="flex justify-center">
                      <div className="border-primary h-8 w-8 animate-spin rounded-full border-b-2" />
                    </div>
                  </CardContent>
                </Card>
              }
            >
              <MaybeErrorComponent shouldError={false} />
            </Suspense>

            <Card className="border-destructive">
              <CardHeader>
                <CardTitle className="text-destructive text-sm">
                  Error State
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-3 text-sm">
                  This simulates what an error.tsx file would show. In
                  production, use error boundaries to catch and display errors
                  gracefully.
                </p>
                <div className="bg-destructive/10 text-destructive rounded p-3 text-sm">
                  Something went wrong. Please try again.
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Code Examples */}
        <section>
          <h2 className="mb-4 text-2xl font-bold">Code Patterns</h2>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">loading.tsx Pattern</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="bg-muted overflow-x-auto rounded-lg p-4 text-xs">
                  {`// app/dashboard/loading.tsx
export default function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

// Automatically wraps page.tsx with Suspense
// Shows while page.tsx is loading`}
                </pre>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">error.tsx Pattern</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="bg-muted overflow-x-auto rounded-lg p-4 text-xs">
                  {`// app/dashboard/error.tsx
"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-12">
      <h2 className="text-2xl font-bold mb-4">Something went wrong!</h2>
      <p className="text-muted-foreground mb-6">{error.message}</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}`}
                </pre>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Suspense Pattern</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="bg-muted overflow-x-auto rounded-lg p-4 text-xs">
                  {`// Fine-grained loading with Suspense
import { Suspense } from "react";

export default function Page() {
  return (
    <div>
      <h1>My Dashboard</h1>

      {/* Fast content loads immediately */}
      <QuickSection />

      {/* Slow content shows skeleton while loading */}
      <Suspense fallback={<Skeleton />}>
        <SlowSection />
      </Suspense>

      {/* Multiple sections load independently */}
      <div className="grid grid-cols-2 gap-4">
        <Suspense fallback={<Skeleton />}>
          <AsyncCard1 />
        </Suspense>
        <Suspense fallback={<Skeleton />}>
          <AsyncCard2 />
        </Suspense>
      </div>
    </div>
  );
}`}
                </pre>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </div>
  );
}
