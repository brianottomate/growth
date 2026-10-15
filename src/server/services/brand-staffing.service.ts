import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db, type Database, type TransactionClient } from "@/server/db";
import { brandTable, memberTable } from "@/server/db/schema";
import { PerformanceError } from "./performance.service";

// Who works on a client: `brand.ownerId` is the lead (sales, creative and
// delivery), `brand.csLeadId` the customer success lead. Only people in the
// brand's organization can hold either.

export type BrandStaffRole = "lead" | "cs";

export async function assertOrganizationStaffUser(
  orgId: string,
  userId: string | null,
  client: Database | TransactionClient = db,
) {
  if (!userId) return;
  const membership = await client.query.memberTable.findFirst({
    where: and(
      eq(memberTable.organizationId, orgId),
      eq(memberTable.userId, userId),
    ),
    columns: { id: true },
  });
  if (!membership)
    throw new PerformanceError("BAD_REQUEST", "Not in this organization");
}

/** The organization's people, for the pickers. */
export async function loadStaffRoster(orgId: string) {
  const rows = await db.query.memberTable.findMany({
    where: eq(memberTable.organizationId, orgId),
    with: { user: { columns: { id: true, name: true, image: true } } },
  });
  return rows
    .map((row) => row.user)
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
}

export async function setBrandStaff(
  orgId: string,
  input: { brandId: string; role: BrandStaffRole; userId: string | null },
) {
  await assertOrganizationStaffUser(orgId, input.userId);
  const [updated] = await db
    .update(brandTable)
    .set(
      input.role === "lead"
        ? { ownerId: input.userId }
        : { csLeadId: input.userId },
    )
    .where(
      and(
        eq(brandTable.id, input.brandId),
        eq(brandTable.organizationId, orgId),
        isNull(brandTable.deletedAt),
      ),
    )
    .returning({ id: brandTable.id });
  if (!updated) throw new PerformanceError("NOT_FOUND", "Brand not found");
}
