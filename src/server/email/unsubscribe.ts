import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";

import { env } from "@/env";
import { UNSUBSCRIBE_PLACEHOLDER } from "@/lib/email-personalization";
import { getPostmarkMessageStream } from "@/server/clients/postmark.client";
import { db } from "@/server/db";
import { emailOptOutTable } from "@/server/db/schema";

// Who handles a brand's unsubscribes is the Postmark broadcast stream's own
// setting. "Postmark": Postmark fills {{{ pm:unsubscribe }}}, adds the
// List-Unsubscribe headers and suppresses unsubscribers. "Custom": Postmark
// leaves all of that to us, so a send swaps in the recipient's signed link
// (/u/<token>) and adds the one-click headers. Rendered emails keep the
// placeholder either way; email.opt_out is always respected.

// Derived from the auth secret so no new secret is needed. Rotating
// BETTER_AUTH_SECRET retires every unsubscribe link already sent.
const signingKey = () =>
  createHash("sha256")
    .update(`growth-email-unsubscribe:${env.BETTER_AUTH_SECRET}`)
    .digest();

const sign = (payload: string) =>
  createHmac("sha256", signingKey()).update(payload).digest("base64url");

/** brandId + email, signed. No lookup and nothing to expire. */
export function unsubscribeToken(brandId: string, email: string) {
  const payload = Buffer.from(
    JSON.stringify([brandId, email.trim().toLowerCase()]),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readUnsubscribeToken(token: string) {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given))
    return null;
  try {
    const [brandId, email] = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as [unknown, unknown];
    return typeof brandId === "string" && typeof email === "string"
      ? { brandId, email }
      : null;
  } catch {
    return null;
  }
}

/** The footer link and the RFC 8058 one-click headers for one recipient. */
export function personalUnsubscribe(brandId: string, email: string) {
  const token = unsubscribeToken(brandId, email);
  const base = env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, "");
  return {
    url: `${base}/u/${token}`,
    headers: [
      {
        Name: "List-Unsubscribe",
        Value: `<${base}/api/email/unsubscribe/${token}>`,
      },
      { Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" },
    ],
  };
}

const HANDLING_TTL_MS = 5 * 60_000;
const handling = new Map<string, { custom: boolean; at: number }>();

/**
 * True when the stream leaves unsubscribes to Growth. Read from Postmark,
 * the setting's owner, and cached for five minutes per server and stream.
 */
export async function growthHandlesUnsubscribes(
  serverToken: string,
  streamId: string,
) {
  const key = `${serverToken}:${streamId}`;
  const cached = handling.get(key);
  if (cached && Date.now() - cached.at < HANDLING_TTL_MS) return cached.custom;
  const stream = await getPostmarkMessageStream(serverToken, streamId);
  const custom =
    stream.SubscriptionManagementConfiguration?.UnsubscribeHandlingType ===
    "Custom";
  handling.set(key, { custom, at: Date.now() });
  return custom;
}

/** Put the recipient's link where the renderer left the placeholder. */
export function withUnsubscribeUrl(content: string, url: string) {
  return content.replaceAll(UNSUBSCRIBE_PLACEHOLDER, url);
}

export async function recordOptOut(input: {
  brandId: string;
  email: string;
  source: string;
}) {
  await db
    .insert(emailOptOutTable)
    .values({ ...input, email: input.email.trim().toLowerCase() })
    .onConflictDoNothing();
}

/** Which of these addresses opted out of the brand's email. */
export async function brandOptOuts(brandId: string, emails: string[]) {
  if (!emails.length) return new Set<string>();
  const rows = await db
    .select({ email: emailOptOutTable.email })
    .from(emailOptOutTable)
    .where(
      and(
        eq(emailOptOutTable.brandId, brandId),
        inArray(emailOptOutTable.email, emails),
      ),
    );
  return new Set(rows.map((row) => row.email));
}

export async function isOptedOut(brandId: string, email: string) {
  return (await brandOptOuts(brandId, [email.trim().toLowerCase()])).size > 0;
}
