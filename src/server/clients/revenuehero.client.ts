import "server-only";

import { z } from "zod";

import { env } from "@/env";

/**
 * RevenueHero meeting lookup, fronted by a Make.com webhook.
 *
 * Meta "meeting link" forms send the lead to book a call with a specific rep
 * after the form submit. The Make scenario answers "which rep holds a meeting
 * for this email?" from its RevenueHero booking store, so the inbound router
 * can assign the lead to that rep instead of the round robin.
 *
 * Contract: POST JSON `{ email }` → JSON `{ "salesRepEmail": "<rep>" }`. No
 * match is `{}` or a null/empty `salesRepEmail`. Anything else (a non-2xx, a
 * body that isn't that JSON, a rep that isn't an email) throws, so a broken
 * scenario shows up as a lookup error instead of passing for "no meeting".
 * The URL is the secret.
 */

const TIMEOUT_MS = 10_000;

export const isRevenueHeroLookupConfigured = Boolean(
  env.REVENUEHERO_LOOKUP_WEBHOOK_URL,
);

const meetingRepResponseSchema = z.object({
  salesRepEmail: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.union([z.literal(""), z.email()]))
    .nullish(),
});

/**
 * The rep email out of a lookup response, lowercased, or null for an explicit
 * no-match. Throws when the response breaks the contract.
 */
export function parseMeetingRepResponse(json: unknown): string | null {
  const parsed = meetingRepResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `[revenuehero] unexpected lookup response: ${JSON.stringify(json)?.slice(0, 200)}`,
    );
  }
  return parsed.data.salesRepEmail || null;
}

/** Rep email holding a RevenueHero meeting for `email`, or null when none. Throws on transport, HTTP or contract failure. */
export async function lookupMeetingRep(email: string): Promise<string | null> {
  if (!env.REVENUEHERO_LOOKUP_WEBHOOK_URL) {
    throw new Error("REVENUEHERO_LOOKUP_WEBHOOK_URL is not configured");
  }
  const response = await fetch(env.REVENUEHERO_LOOKUP_WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await response.text().catch(() => "");
  if (!response.ok) {
    throw new Error(
      `[revenuehero] lookup failed: ${response.status} ${text.slice(0, 200)}`,
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(
      `[revenuehero] lookup response is not JSON: ${text.slice(0, 200)}`,
    );
  }
  return parseMeetingRepResponse(json);
}
