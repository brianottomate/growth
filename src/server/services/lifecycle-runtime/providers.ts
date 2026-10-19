import "server-only";
import { Client, Receiver } from "@upstash/qstash";
import {
  postmarkServerToken,
  sendPostmarkBatch,
} from "@/server/clients/postmark.client";
import { env } from "@/env";
import type { LifecycleEmailPayload } from "@/lib/validators/lifecycle-runtime";
import {
  growthHandlesUnsubscribes,
  withUnsubscribeUrl,
} from "@/server/email/unsubscribe";

export function lifecycleReadiness() {
  const missing = Object.entries({
    QSTASH_TOKEN: env.QSTASH_TOKEN,
    QSTASH_CURRENT_SIGNING_KEY: env.QSTASH_CURRENT_SIGNING_KEY,
    QSTASH_NEXT_SIGNING_KEY: env.QSTASH_NEXT_SIGNING_KEY,
    POSTMARK_ACCOUNT_TOKEN: env.POSTMARK_ACCOUNT_TOKEN,
    POSTMARK_WEBHOOK_SECRET: env.POSTMARK_WEBHOOK_SECRET,
    LIFECYCLE_BASE_URL: env.LIFECYCLE_BASE_URL,
    LIFECYCLE_RUNTIME_ID: env.LIFECYCLE_RUNTIME_ID,
  })
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (env.LIFECYCLE_ENABLED !== "true") missing.push("LIFECYCLE_ENABLED=true");
  if (env.LIFECYCLE_BASE_URL && !env.LIFECYCLE_BASE_URL.startsWith("https://"))
    missing.push("LIFECYCLE_BASE_URL must use HTTPS");
  return { ready: missing.length === 0, missing };
}
export function requireLifecycleRuntime() {
  const readiness = lifecycleReadiness();
  if (!readiness.ready)
    throw new Error(
      `Lifecycle delivery is not configured: ${readiness.missing.join(", ")}`,
    );
}
export function lifecycleUrl(path: string) {
  if (!env.LIFECYCLE_BASE_URL)
    throw new Error("LIFECYCLE_BASE_URL is not configured");
  return new URL(path, env.LIFECYCLE_BASE_URL).toString();
}
export async function publishLifecycleDelivery(
  deliveryId: string,
  dueAt: Date,
) {
  return publishEmailJob({
    path: "/api/jobs/lifecycle",
    failurePath: "/api/jobs/lifecycle/failure",
    key: deliveryId,
    body: { deliveryId, runtimeId: env.LIFECYCLE_RUNTIME_ID ?? "" },
    dueAt,
  });
}

/** Shared durable wakeups for journeys and calendar broadcasts. */
export async function publishEmailJob(input: {
  path: string;
  failurePath?: string;
  key: string;
  body: Record<string, string>;
  dueAt: Date;
}) {
  requireLifecycleRuntime();
  const { dueAt } = input;
  const client = new Client({
    token: env.QSTASH_TOKEN!,
    ...(env.QSTASH_URL ? { baseUrl: env.QSTASH_URL } : {}),
  });
  // Free QStash supports seven-day delays. Leave a minute of clock headroom.
  // Early wakeups schedule the same durable delivery again without sending.
  const wakeAt = Math.min(
    dueAt.getTime(),
    Date.now() + (7 * 24 * 60 - 1) * 60_000,
  );
  const result = await client.publishJSON({
    url: lifecycleUrl(input.path),
    body: input.body,
    notBefore: Math.ceil(wakeAt / 1000),
    deduplicationId: `${input.key}-${Math.floor(wakeAt / 60_000)}`,
    retries: 5,
    retryDelay: "60000 * (1 + retried)",
    timeout: "60s",
    ...(input.failurePath
      ? { failureCallback: lifecycleUrl(input.failurePath) }
      : {}),
  });
  return {
    messageId: result.messageId,
    nextDispatchAt: new Date(wakeAt + 30 * 60_000),
  };
}
export async function verifyLifecycleJob(
  body: string,
  signature: string,
  path = "/api/jobs/lifecycle",
) {
  if (
    !env.QSTASH_CURRENT_SIGNING_KEY ||
    !env.QSTASH_NEXT_SIGNING_KEY ||
    !env.LIFECYCLE_BASE_URL
  )
    return false;
  try {
    return await new Receiver({
      currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
      nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
    }).verify({ signature, body, url: lifecycleUrl(path) });
  } catch {
    return false;
  }
}
export async function sendLifecycleEmail(
  payload: LifecycleEmailPayload,
  deliveryId: string,
  test = false,
) {
  requireLifecycleRuntime();
  const token = await postmarkServerToken(payload.delivery.serverId);
  const own =
    payload.unsubscribe &&
    (await growthHandlesUnsubscribes(token, payload.delivery.messageStream))
      ? payload.unsubscribe
      : null;
  const [result] = await sendPostmarkBatch(token, [
    {
      From: payload.from,
      To: payload.to,
      Subject: payload.subject,
      ...(payload.replyTo ? { ReplyTo: payload.replyTo } : {}),
      HtmlBody: own ? withUnsubscribeUrl(payload.html, own.url) : payload.html,
      TextBody: own ? withUnsubscribeUrl(payload.text, own.url) : payload.text,
      ...(own ? { Headers: own.headers } : {}),
      MessageStream: payload.delivery.messageStream,
      Tag: test ? "growth-test" : "growth-lifecycle",
      TrackOpens: false,
      TrackLinks: "None",
      Metadata: {
        lifecycle_delivery: deliveryId,
        ...(test ? { test: "true" } : {}),
      },
    },
  ]);
  if (result?.ErrorCode !== 0 || !result.MessageID)
    throw new Error(
      `Postmark did not confirm acceptance (code ${result?.ErrorCode ?? "unknown"}).`,
    );
  return result.MessageID;
}
