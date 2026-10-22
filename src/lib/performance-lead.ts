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

/** Broad beta fit: only explicit guest/booking inquiries are excluded. */
export function isQualifiedPerformanceLead(input: {
  audience: "operator" | "guest" | "unknown";
}): boolean {
  return input.audience !== "guest";
}
