import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { getSession } from "@/server/better-auth/server";
import { resolveWorkspaceOrganizationId } from "@/server/workspace-actor";
import { db } from "@/server/db";
import { brandTable } from "@/server/db/schema";
import { EmailAudiencesClient } from "./EmailAudiencesClient";

export default async function EmailAudiencesPage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");
  const organizationId = await resolveWorkspaceOrganizationId({
    userId: session.user.id,
    preferredOrganizationId: session.session.activeOrganizationId,
  });
  const brands = await db.query.brandTable.findMany({
    where: and(
      eq(brandTable.organizationId, organizationId),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true, name: true, slug: true, wanderOsWebsiteId: true },
  });
  return <EmailAudiencesClient brands={brands} />;
}
