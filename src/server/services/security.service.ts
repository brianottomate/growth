import "server-only";

import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import {
  memberTable,
  organizationTable,
  type Member,
  type Organization,
} from "@/server/db/schema";
import type { OrganizationRole } from "@/server/db/constants";

export type OrgPermissions = {
  canInvite: boolean;
  canManageMembers: boolean;
  canUpdateOrg: boolean;
  canDeleteOrg: boolean;
};

export function computeOrgPermissions(role: OrganizationRole): OrgPermissions {
  const isAdminOrOwner = role === "admin" || role === "owner";
  return {
    canInvite: isAdminOrOwner,
    canManageMembers: isAdminOrOwner,
    canUpdateOrg: isAdminOrOwner,
    canDeleteOrg: role === "owner",
  };
}

/**
 * Resolve the organization and the caller's exact membership together. Every
 * organization mutation should enter through this boundary before loading a
 * member, invitation, or other child record.
 */
export async function loadOrganizationWithAccess(
  organizationId: string,
  userId: string,
): Promise<{
  organization: Organization;
  membership: Member;
  permissions: OrgPermissions;
}> {
  const [organization, membership] = await Promise.all([
    db.query.organizationTable.findFirst({
      where: and(
        eq(organizationTable.id, organizationId),
        isNull(organizationTable.deletedAt),
      ),
    }),
    db.query.memberTable.findFirst({
      where: and(
        eq(memberTable.organizationId, organizationId),
        eq(memberTable.userId, userId),
      ),
    }),
  ]);

  if (!organization) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Organization not found",
    });
  }
  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You don't have access to this organization",
    });
  }

  return {
    organization,
    membership,
    permissions: computeOrgPermissions(membership.role),
  };
}
