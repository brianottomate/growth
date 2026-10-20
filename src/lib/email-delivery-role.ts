import type { OrganizationRole } from "@/server/db/constants";

/** Provider email operations are limited to organization delivery operators. */
export function canOperateEmailDelivery(
  role: OrganizationRole | null | undefined,
) {
  return role === "owner" || role === "admin";
}
