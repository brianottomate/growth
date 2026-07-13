import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { and, eq, isNull } from "drizzle-orm";

import { AppSidebar } from "@/components/app-sidebar";
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
    redirect("/signin");
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
      <AppSidebar
        orgName={membership?.organization?.name ?? "—"}
        orgSlug={membership?.organization?.slug ?? undefined}
        userName={session.user.name ?? session.user.email ?? "You"}
        userEmail={session.user.email ?? ""}
        userImage={session.user.image ?? undefined}
      />
      <div className="flex min-w-0 flex-1">
        <SidebarInset className="min-w-0">
          <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
          </header>
          {/* @container lets wide surfaces (e.g. the content Board) break out of
              the centered column with a cqw-based negative margin. */}
          <div className="@container flex-1 overflow-auto">
            <div className="mx-auto w-full max-w-5xl p-8">{children}</div>
          </div>
        </SidebarInset>
        <OverviewAssistantPopup
          userName={session.user.name ?? session.user.email ?? "there"}
          brands={brands}
        />
      </div>
    </SidebarProvider>
  );
}
