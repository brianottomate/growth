import "server-only";
import { createHmac } from "node:crypto";
import { EMAIL_RECIPIENT_KEY_PREFIX } from "@/lib/performance-booking";
import { env } from "@/env";

// Domain-separated from auth/unsubscribe use. Secret rotation retires old link keys.
// Email is the identity; neither a WanderOS user ID nor reversible encoding is needed.
export function emailRecipientKey(brandId: string, email: string): string {
  const secret = env.BETTER_AUTH_SECRET;
  if (!secret)
    throw new Error(
      "BETTER_AUTH_SECRET is required for email recipient identity.",
    );
  return `${EMAIL_RECIPIENT_KEY_PREFIX}${createHmac("sha256", secret)
    .update(
      JSON.stringify([
        "growth-email-recipient-v1",
        brandId,
        email.trim().toLowerCase(),
      ]),
    )
    .digest("base64url")}`;
}

export function emailRecipientMetadata(input: {
  sendId: string;
  postId: string;
  recipientId: string;
  key: string;
}) {
  // Postmark metadata names must be <=20 characters; values <=80.
  return {
    message_send_id: input.sendId,
    platform_post_id: input.postId,
    recipient_id: input.recipientId,
    email_recipient_key: input.key,
  };
}
