/**
 * Pure readers for HubSpot SDK error shapes (`ApiException`: `code` is the
 * HTTP status, `body` the parsed JSON). Kept free of I/O so the rules can be
 * unit-tested.
 */

/** HTTP status of a thrown SDK error, or null when it is not one. */
export function httpStatusOf(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const candidate =
    (error as { code?: unknown }).code ??
    (error as { statusCode?: unknown }).statusCode;
  const status = Number(candidate);
  return Number.isFinite(status) ? status : null;
}

/** 429 and 5xx: worth one more try. Anything else is the caller's problem. */
export function isRetryableHubspotError(error: unknown): boolean {
  const status = httpStatusOf(error);
  return status === 429 || (status !== null && status >= 500);
}

/** The existing contact id from a HubSpot 409 on create, or null. */
export function conflictingContactId(error: unknown): string | null {
  if (httpStatusOf(error) !== 409) return null;
  const body = (error as { body?: unknown }).body;
  const message =
    typeof body === "string"
      ? body
      : typeof body === "object" && body !== null && "message" in body
        ? String((body as { message?: unknown }).message)
        : ((error as { message?: string }).message ?? "");
  const match = /Existing ID:\s*(\d+)/i.exec(message);
  return match?.[1] ?? null;
}

/**
 * Retry an idempotent HubSpot call on 429/5xx with a short backoff. Never
 * wrap a create with this — a 5xx after commit would duplicate the record.
 */
export async function withHubspotRetry<T>(
  label: string,
  fn: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      if (attempt >= attempts || !isRetryableHubspotError(error)) throw error;
      const delayMs = (httpStatusOf(error) === 429 ? 1500 : 500) * attempt;
      console.warn(
        `⚠️ [HubSpot] ${label} got ${httpStatusOf(error)} — retry ${attempt}/${attempts - 1} in ${delayMs}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
