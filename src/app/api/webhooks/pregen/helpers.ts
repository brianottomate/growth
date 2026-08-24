/** Normalize WanderOS source URLs to the bare host used by lead records. */
export function hostFromUrl(value: string): string | null {
  try {
    return new URL(value).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

/** Extract the preview bearer token embedded in WanderOS preview URLs. */
export function tokenFromPreviewUrl(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  try {
    return new URL(value).searchParams.get("t") || null;
  } catch {
    return null;
  }
}
