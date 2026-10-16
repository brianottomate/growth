/**
 * E.164 from the loose formats our sources hold ("(904) 566-2800",
 * "14152699738", "+1 (317) 626-0163"). Bare ten-digit numbers are read as
 * North American only when the profile country allows it; anything else that
 * lacks a country code is unknowable and returns null.
 */
export function toE164(
  raw: string | null | undefined,
  country?: string | null,
) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (raw.trim().startsWith("+"))
    return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
  const nanp = !country || ["US", "CA"].includes(country.toUpperCase());
  if (nanp && /^[2-9]\d{9}$/.test(digits)) return `+1${digits}`;
  if (nanp && /^1[2-9]\d{9}$/.test(digits)) return `+${digits}`;
  return null;
}
