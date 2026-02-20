/**
 * Client-safe constants derived from database enums
 *
 * This file exports const arrays and types that can be safely imported
 * in client code and validators without pulling in database dependencies.
 */

// ---- AUTH SCHEMA CONSTANTS ----

// Currency constants
export const CURRENCIES = ["usd", "eur", "nok", "gbp", "cad"] as const;
export type Currency = (typeof CURRENCIES)[number];

// Date format constants
export const DATE_FORMATS = ["mm_dd_yyyy", "dd_mm_yyyy", "yyyy_mm_dd"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

// Unit system constants
export const UNIT_SYSTEMS = ["metric", "imperial"] as const;
export type UnitSystem = (typeof UNIT_SYSTEMS)[number];

// Organization role constants
export const ORGANIZATION_ROLES = ["owner", "admin", "member"] as const;
export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

// Organization plan constants
export const ORGANIZATION_PLANS = ["free", "pro", "enterprise"] as const;
export type OrganizationPlan = (typeof ORGANIZATION_PLANS)[number];

// ---- APP CONSTANTS ----

// Resource types for attachments
export const RESOURCE_TYPES = ["organization", "post", "user_photo"] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

// Status values for invitations and other workflows
export const STATUS_VALUES = [
  "pending",
  "accepted",
  "rejected",
  "expired",
] as const;
export type StatusValue = (typeof STATUS_VALUES)[number];
