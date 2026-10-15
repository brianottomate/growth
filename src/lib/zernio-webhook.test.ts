import { createHmac } from "node:crypto";
import { expect, test } from "bun:test";
import {
  parseZernioWebhook,
  verifyZernioWebhookSignature,
  zernioAdsSyncSchema,
} from "./zernio-webhook";

// This webhook can start account setup. Provider scope must come from an
// authenticated, structurally valid event, never a forged or partial body.
test("ads setup accepts only the signed body and requires exact connection/profile identities", () => {
  const event = {
    id: "event-1",
    event: "account.ads.initial_sync_completed",
    account: {
      accountId: "connection-1",
      profileId: "profile-1",
      platform: "metaads",
      platformAdAccountIds: ["act_123"],
    },
    sync: { status: "success" },
  };
  const raw = JSON.stringify(event);
  const secret = "synthetic-webhook-secret";
  const signature = createHmac("sha256", secret).update(raw).digest("hex");
  expect(verifyZernioWebhookSignature(raw, signature, secret)).toBe(true);
  expect(
    verifyZernioWebhookSignature(
      raw.replace("profile-1", "profile-2"),
      signature,
      secret,
    ),
  ).toBe(false);
  expect(verifyZernioWebhookSignature(raw, null, secret)).toBe(false);
  expect(
    zernioAdsSyncSchema.parse(parseZernioWebhook(raw)).account.profileId,
  ).toBe("profile-1");
  expect(
    zernioAdsSyncSchema.safeParse({
      ...event,
      account: { ...event.account, profileId: null },
    }).success,
  ).toBe(false);
  expect(zernioAdsSyncSchema.safeParse({ ...event, sync: {} }).success).toBe(
    false,
  );
});
