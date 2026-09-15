import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/server/better-auth";
import { db } from "@/server/db";
import { memberTable, organizationTable } from "@/server/db/schema";
import { WorkspaceSelector } from "./WorkspaceSelector";

export const metadata: Metadata = {
  title: "Choose a Wander Growth workspace",
  robots: { index: false, follow: false },
};

export default async function OAuthWorkspacePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/signin");

  const organizations = await db
    .select({
      id: organizationTable.id,
      name: organizationTable.name,
      slug: organizationTable.slug,
      role: memberTable.role,
    })
    .from(memberTable)
    .innerJoin(
      organizationTable,
      eq(memberTable.organizationId, organizationTable.id),
    )
    .where(eq(memberTable.userId, session.user.id));

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted p-6">
      <WorkspaceSelector organizations={organizations} />
    </div>
  );
}
