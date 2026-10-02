import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { memberTable, organizationTable } from "@/server/db/schema";

/** Growth has one workspace. Never choose an arbitrary membership or session org. */
export async function getWanderMembership(
  userId: string,
  database: typeof db = db,
) {
  const wander = await database.query.organizationTable.findFirst({
    where: eq(organizationTable.slug, "wander"),
    columns: { id: true },
  });
  if (!wander) return undefined;
  return database.query.memberTable.findFirst({
    where: and(
      eq(memberTable.userId, userId),
      eq(memberTable.organizationId, wander.id),
    ),
    with: { organization: true },
  });
}
