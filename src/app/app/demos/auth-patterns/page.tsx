import { auth } from "@/server/better-auth";
import { headers } from "next/headers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * AUTHENTICATION PATTERNS BEST PRACTICES
 *
 * This demo showcases auth patterns using Better Auth:
 * - Server-side session checking
 * - Protected routes
 * - User data access
 * - Role-based access
 * - Auth utilities
 */

export default async function AuthPatternsDemo() {
  // Get session on server (no API call needed!)
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  // Optional: Protect route (redirect if not authenticated)
  // if (!session) {
  //   redirect("/auth/login");
  // }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8">
        <h1 className="mb-2 text-4xl font-bold">
          Authentication Patterns Demo
        </h1>
        <p className="text-muted-foreground">
          Best practices for authentication using Better Auth
        </p>
      </div>

      {/* Pattern Explanation */}
      <Card className="border-primary mb-8">
        <CardHeader>
          <CardTitle>Key Concepts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="mb-2 font-semibold">🎯 Better Auth Features:</h3>
            <ul className="text-muted-foreground ml-4 list-inside list-disc space-y-1 text-sm">
              <li>
                <strong>Type-safe</strong> - Full TypeScript support with
                inference
              </li>
              <li>
                <strong>Plugin system</strong> - Username, anonymous, admin
                plugins
              </li>
              <li>
                <strong>Database agnostic</strong> - Works with any database via
                adapters
              </li>
              <li>
                <strong>OAuth providers</strong> - Google, GitHub, Discord, etc.
              </li>
              <li>
                <strong>Magic links</strong> - Passwordless authentication
              </li>
            </ul>
          </div>
          <div>
            <h3 className="mb-2 font-semibold">✅ Best Practices:</h3>
            <ul className="text-muted-foreground ml-4 list-inside list-disc space-y-1 text-sm">
              <li>Check auth in Server Components for protected routes</li>
              <li>Use middleware for route-level protection</li>
              <li>Implement role-based access control (RBAC)</li>
              <li>Store minimal data in session tokens</li>
              <li>Validate sessions on every request</li>
              <li>Handle auth errors gracefully</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Session Info */}
      <section className="mb-8">
        <h2 className="mb-4 text-2xl font-bold">Current Session</h2>
        {session ? (
          <Card className="border-green-500">
            <CardHeader>
              <CardTitle className="text-lg text-green-700">
                ✓ Authenticated
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="mb-1 text-sm font-medium">User Information:</p>
                <div className="bg-muted space-y-1 rounded-lg p-3 text-sm">
                  <p>
                    <strong>ID:</strong> {session.user.id}
                  </p>
                  <p>
                    <strong>Email:</strong> {session.user.email}
                  </p>
                  <p>
                    <strong>Name:</strong> {session.user.name || "Not set"}
                  </p>
                  <p>
                    <strong>Role:</strong> {session.user.role || "user"}
                  </p>
                </div>
              </div>

              <div>
                <p className="mb-1 text-sm font-medium">Session Information:</p>
                <div className="bg-muted space-y-1 rounded-lg p-3 text-sm">
                  <p>
                    <strong>Session ID:</strong>{" "}
                    {session.session.id.slice(0, 20)}
                    ...
                  </p>
                  <p>
                    <strong>Expires:</strong>{" "}
                    {new Date(session.session.expiresAt).toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-amber-500">
            <CardHeader>
              <CardTitle className="text-lg text-amber-700">
                ⚠ Not Authenticated
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4 text-sm">
                You are not currently logged in. This page is accessible to
                everyone, but protected routes would redirect to login.
              </p>
              <a
                href="/auth/login"
                className="text-primary text-sm hover:underline"
              >
                Go to Login →
              </a>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Code Examples */}
      <section>
        <h2 className="mb-4 text-2xl font-bold">Code Patterns</h2>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                1. Get Session in Server Component
              </CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted overflow-x-auto rounded-lg p-4 text-xs">
                {`// app/dashboard/page.tsx
import { auth } from "@/server/better-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  // ✅ Get session on server
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  // Protect route
  if (!session) {
    redirect("/auth/login");
  }

  // Access user data
  const user = session.user;

  return (
    <div>
      <h1>Welcome, {user.name}!</h1>
      <p>Email: {user.email}</p>
    </div>
  );
}`}
              </pre>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                2. Role-Based Access Control
              </CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted overflow-x-auto rounded-lg p-4 text-xs">
                {`// app/admin/page.tsx
import { auth } from "@/server/better-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function AdminPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  // Check if user is admin
  if (!session || session.user.role !== "admin") {
    redirect("/unauthorized");
  }

  return <div>Admin Dashboard</div>;
}

// Or create a reusable utility
export async function requireAdmin() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session || session.user.role !== "admin") {
    redirect("/unauthorized");
  }

  return session;
}

// Usage:
export default async function AdminPage() {
  const session = await requireAdmin();
  // ...
}`}
              </pre>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                3. Protected tRPC Procedures
              </CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted overflow-x-auto rounded-lg p-4 text-xs">
                {`// server/api/trpc.ts
import { auth } from "@/server/better-auth";
import { TRPCError } from "@trpc/server";

// Create protected procedure
export const protectedProcedure = publicProcedure.use(
  async ({ ctx, next }) => {
    const session = await auth.api.getSession({
      headers: ctx.headers,
    });

    if (!session) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    return next({
      ctx: {
        ...ctx,
        session,
        user: session.user,
      },
    });
  }
);

// Usage in router
export const userRouter = createTRPCRouter({
  // Public - anyone can call
  getPublicInfo: publicProcedure.query(() => {
    return { message: "Public data" };
  }),

  // Protected - requires auth
  getProfile: protectedProcedure.query(({ ctx }) => {
    // ctx.user is guaranteed to exist
    return ctx.user;
  }),

  // Admin only
  deleteUser: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      // Delete user
    }),
});`}
              </pre>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                4. Client-Side Auth Check
              </CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted overflow-x-auto rounded-lg p-4 text-xs">
                {`"use client";

import { useSession } from "@/hooks/use-session"; // Custom hook
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function ProtectedClientComponent() {
  const { session, isLoading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !session) {
      router.push("/auth/login");
    }
  }, [session, isLoading, router]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!session) {
    return null;
  }

  return (
    <div>
      <h2>Protected Content</h2>
      <p>Welcome, {session.user.name}!</p>
    </div>
  );
}

// Or use a wrapper component
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, isLoading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !session) {
      router.push("/auth/login");
    }
  }, [session, isLoading, router]);

  if (isLoading) return <div>Loading...</div>;
  if (!session) return null;

  return <>{children}</>;
}`}
              </pre>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
