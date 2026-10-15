import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

const envelopeSchema = z
  .object({
    id: z.string().min(1),
    event: z.string().min(1),
    post: z
      .object({ id: z.string().min(1) })
      .passthrough()
      .optional(),
    timestamp: z.string().optional(),
  })
  .passthrough();

const DELIVERY_EVENTS = new Set([
  "post.published",
  "post.failed",
  "post.partial",
  "post.cancelled",
  "post.platform.published",
  "post.platform.failed",
]);

export function parseZernioWebhook(rawBody: string) {
  try {
    const parsed = envelopeSchema.safeParse(JSON.parse(rawBody));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function isZernioDeliveryEvent(event: string) {
  return DELIVERY_EVENTS.has(event);
}

export function verifyZernioWebhookSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
) {
  if (!signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const received = Buffer.from(signature, "hex");
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
}

/** Initial sync is evidence of discovery, not blanket permission for every account. */
export const zernioAdsSyncSchema = z.object({
  id: z.string().min(1),
  event: z.literal("account.ads.initial_sync_completed"),
  account: z.object({
    accountId: z.string().min(1),
    profileId: z.string().min(1),
    platform: z.string(),
    platformAdAccountId: z.string().optional(),
    platformAdAccountIds: z.array(z.string()).optional(),
  }),
  sync: z.object({
    status: z.enum(["success", "failure"]),
    errorCategory: z.string().optional(),
  }),
});
