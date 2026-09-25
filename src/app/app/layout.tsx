import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { and, eq, isNull } from "drizzle-orm";

import { WorkspaceChanges } from "./WorkspaceChanges";
import { AppSidebar } from "@/components/app-sidebar";
import { CommandMenu } from "@/components/command-menu";
import { AUTH_RETURN_TO_HEADER, getSafeInternalPath } from "@/lib/auth-utils";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { db } from "@/server/db";
import { brandTable, memberTable } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
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

  // Active organization for the sidebar header. Falls back to the user's first
  // membership if no active org is set on the session yet.
  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
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
        orgName={membership?.organization?.name ?? "—"}
        orgSlug={membership?.organization?.slug ?? undefined}
        userName={session.user.name ?? session.user.email ?? "You"}
        userEmail={session.user.email ?? ""}
        userImage={session.user.image ?? undefined}
      />
      <div className="flex h-svh min-w-0 flex-1 overflow-hidden">
        <SidebarInset className="h-svh min-h-0 min-w-0 overflow-hidden">
          <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
          </header>
          {/* @container lets wide surfaces (e.g. the content Board) break out of
              the centered column with a cqw-based negative margin. Those
              margins repeat the column's padding (1rem, 2rem from @xl), so
              change them together. */}
          <div className="@container min-h-0 flex-1 scrollbar-thin overflow-x-hidden overflow-y-auto">
            <div className="mx-auto w-full max-w-5xl p-4 pb-20 @xl:p-8 @xl:pb-20">
              {children}
            </div>
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
