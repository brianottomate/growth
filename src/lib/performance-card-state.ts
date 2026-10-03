import { z } from "zod";

export const performanceAmountSchema = z
  .number()
  .nonnegative()
  .multipleOf(0.01)
  .max(Number.MAX_SAFE_INTEGER / 100);

export const CATALOG_STATES = [
  "Not started",
  "In production",
  "Approved",
  "Export ready",
  "Live",
] as const;
export const CREATIVE_STATES = [
  "Not started",
  "In production",
  "In review",
  "Approved",
] as const;
export const NEWSLETTER_STATES = [
  "Not started",
  "Drafting",
  "In review",
  "Approved",
] as const;
export const PLATFORM_STATES = [
  "Not created",
  "Draft",
  "Scheduled",
  "Paused",
  "Live",
  "Ended",
] as const;
export const SITE_STATES = [
  "Not started",
  "Building",
  "Ready",
  "Live",
] as const;
export const ZERNIO_ACCESS_STATES = ["Not connected", "Connected"] as const;
export const DNS_STATES = ["Not connected", "DNS pending", "Verified"] as const;
export const INTAKE_STATES = [
  "Not sent",
  "Sent",
  "Viewed",
  "Submitted",
] as const;
export const PAYMENT_STATES = ["Not invoiced", "Open", "Paid"] as const;
export const COMMERCIAL_STATES = [
  "Prospect",
  "Pitch sent",
  "Meeting booked",
  "Signed",
  "Paused",
  "Lost",
  "Churned",
] as const;

/** Deliberately recorded application state, independent of provider and cycle records. */
export const performanceCardStateSchema = z.strictObject({
  commercial: z.enum(COMMERCIAL_STATES).nullish(),
  intake: z.enum(INTAKE_STATES).nullish(),
  billingPeriod: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .nullish(),
  managementPayment: z.enum(PAYMENT_STATES).nullish(),
  spendPayment: z.enum(PAYMENT_STATES).nullish(),
  catalog: z.enum(CATALOG_STATES).nullish(),
  ads: z.enum(CREATIVE_STATES).nullish(),
  newsletter: z.enum(NEWSLETTER_STATES).nullish(),
  meta: z.enum(PLATFORM_STATES).nullish(),
  google: z.enum(PLATFORM_STATES).nullish(),
  site: z.enum(SITE_STATES).nullish(),
  siteConnected: z.boolean().nullish(),
  zernioAccess: z.enum(ZERNIO_ACCESS_STATES).nullish(),
  emailDns: z.enum(DNS_STATES).nullish(),
  includedHomes: z.number().int().nonnegative().nullish(),
});
export type PerformanceCardState = z.infer<typeof performanceCardStateSchema>;

/** A partial chat or form update keeps every other recorded fact; null clears a field. */
export function mergePerformanceCardState(
  current: PerformanceCardState | null | undefined,
  patch: PerformanceCardState,
): PerformanceCardState {
  const next = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) (next as Record<string, unknown>)[key] = value;
  }
  return next;
}

export function recordedStatus(
  value: string | boolean | null | undefined,
): string {
  return value == null
    ? "Not recorded"
    : typeof value === "boolean"
      ? value
        ? "Connected"
        : "Not connected"
      : value;
}

export function recordedPlatforms(state: PerformanceCardState) {
  return (
    [
      { label: "Meta", status: state.meta },
      { label: "Google", status: state.google },
    ] as const
  ).filter(
    (platform) => platform.status != null && platform.status !== "Not created",
  );
}
