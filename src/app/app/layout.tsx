import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { and, eq, isNull } from "drizzle-orm";

import { WorkspaceChanges } from "./WorkspaceChanges";
import { AppSidebar } from "@/components/app-sidebar";
import { CommandMenu } from "@/components/command-menu";
import { ContentColumn, ContentWidthToggle } from "@/components/content-width";
import { AUTH_RETURN_TO_HEADER, getSafeInternalPath } from "@/lib/auth-utils";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { db } from "@/server/db";
import { brandTable } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { getWanderMembership } from "@/server/wander-workspace";
import { OverviewAssistantPopup } from "./overview/OverviewAssistantPopup";

// The whole back-office is internal — keep every route under /app out of
// search. Inherited by all child pages unless they override `robots`.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();

  if (!session?.user) {
    const returnTo = getSafeInternalPath(
      (await headers()).get(AUTH_RETURN_TO_HEADER),
    );
    redirect(
      returnTo ? `/signin?returnTo=${encodeURIComponent(returnTo)}` : "/signin",
    );
  }

  // Resolve the single Wander workspace.
  const membership = await getWanderMembership(session.user.id);
  const brands = membership?.organizationId
    ? await db.query.brandTable.findMany({
        where: and(
          eq(brandTable.organizationId, membership.organizationId),
          isNull(brandTable.deletedAt),
        ),
        columns: { id: true, name: true, slug: true },
      })
    : [];

  return (
    <SidebarProvider>
      <WorkspaceChanges />
      <AppSidebar
        userName={session.user.name ?? session.user.email ?? "You"}
        userEmail={session.user.email ?? ""}
        userImage={session.user.image ?? undefined}
      />
      {/* On /app/next/<threadId> the assistant fills this row in place of the page. */}
      <div className="group/shell flex h-svh min-w-0 flex-1 overflow-hidden">
        <SidebarInset className="h-svh min-h-0 min-w-0 overflow-hidden group-has-data-assistant-page/shell:hidden">
          <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
            <ContentWidthToggle className="-ml-1" />
          </header>
          {/* @container lets wide surfaces (e.g. the content Board) break out of
              the centered column with a cqw-based negative margin. Those
              margins repeat the column's padding (1rem, 2rem from @xl), so
              change them together. */}
          <div className="@container min-h-0 flex-1 scrollbar-thin overflow-x-hidden overflow-y-auto">
            <ContentColumn>{children}</ContentColumn>
          </div>
        </SidebarInset>
        <OverviewAssistantPopup
          userName={session.user.name ?? session.user.email ?? "there"}
          brands={brands}
        />
      </div>
      <CommandMenu />
    </SidebarProvider>
  );
}
