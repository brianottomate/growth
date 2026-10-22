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

/** Initial beta fit: an operating portfolio and a live direct-booking site. */
export function isQualifiedPerformanceLead(input: {
  audience: "operator" | "guest" | "unknown";
  minimumUnits: number | null;
  directBookingStatus: "live" | "building" | "none" | "unknown";
  bookingSite: { hostname: string; pathname: string } | null;
}): boolean {
  return (
    input.audience === "operator" &&
    input.minimumUnits !== null &&
    input.minimumUnits >= 1 &&
    input.directBookingStatus === "live" &&
    input.bookingSite !== null
  );
}
