import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { auth } from "@/server/better-auth";
import { headers } from "next/headers";
import Link from "next/link";
import { LayoutDashboard, FileText, Settings } from "lucide-react";

export default async function DashboardPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div className="space-y-3">
        <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
          Welcome{session?.user.name ? `, ${session.user.name}` : ""}!
        </h1>
        <p className="text-muted-foreground text-lg">
          This is your application dashboard.
        </p>
      </div>

      {/* Quick Links Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Link href="/app/demos">
          <Card className="h-full cursor-pointer transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-lg">
                  <LayoutDashboard className="text-primary h-5 w-5" />
                </div>
                Best Practices Demos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                Explore comprehensive examples of Next.js patterns and best
                practices
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/blog">
          <Card className="h-full cursor-pointer transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/20">
                  <FileText className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                Blog
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                Read articles and updates from the blog
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/app/account">
          <Card className="h-full cursor-pointer transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/20">
                  <Settings className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                Account Settings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                Manage your profile and preferences
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* User Info Card */}
      <Suspense
        fallback={
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        }
      >
        <Card>
          <CardHeader>
            <CardTitle>Your Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid gap-3">
              <div>
                <p className="text-sm font-medium">Email</p>
                <p className="text-muted-foreground text-sm">
                  {session?.user.email || "Not available"}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium">Name</p>
                <p className="text-muted-foreground text-sm">
                  {session?.user.name || "Not set"}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium">User ID</p>
                <p className="text-muted-foreground font-mono text-sm">
                  {session?.user.id || "Not available"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </Suspense>
    </div>
  );
}
