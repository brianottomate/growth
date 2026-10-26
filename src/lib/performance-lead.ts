/** Meta owns form identity. These are the two Performance beta forms on Wander's Page. */
export const PERFORMANCE_META_FORM_IDS = [
  "1919237109459929", // Direct Booking (Verified) v2
  "2427062551398806", // Direct Booking (Verified)
] as const;

export function isPerformanceMetaForm(
  formId: string | null | undefined,
): boolean {
  return PERFORMANCE_META_FORM_IDS.some((id) => id === formId);
}

/** Performance beta fit: at least ten managed properties, excluding guest inquiries. */
export function isQualifiedPerformanceLead(input: {
  audience: "operator" | "guest" | "unknown";
  minimumUnits: number | null;
}): boolean {
  return (
    input.audience !== "guest" &&
    input.minimumUnits !== null &&
    input.minimumUnits >= 10
  );
}

/** Applications at or below this many properties wait for the daily digest. */
export const PERFORMANCE_DIGEST_MAX_UNITS = 5;

/**
 * Kyle asked (2026-10-26) for real-time Performance alerts only above 5
 * properties, the same cutoff as the WanderOS inbound router; smaller
 * applications, and those with no count yet, wait for the 5pm Mountain digest.
 * Meta forms ask for a range and `minimumUnits` is its lower endpoint, so a
 * 1-9 answer waits and 10-24 posts right away.
 */
export function postsPerformanceAlertImmediately(
  units: number | null | undefined,
): boolean {
  return typeof units === "number" && units > PERFORMANCE_DIGEST_MAX_UNITS;
}
