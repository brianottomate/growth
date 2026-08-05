import { createHmac } from "node:crypto";
import { describe, expect, test } from "bun:test";

import {
  isZernioDeliveryEvent,
  parseZernioWebhook,
  verifyZernioWebhookSignature,
} from "./zernio-webhook";

describe("Zernio webhook", () => {
  test("parses delivery envelopes and classifies events", () => {
    const raw = JSON.stringify({
      id: "evt_1",
      event: "post.published",
      post: { id: "zp_1" },
    });
    expect(parseZernioWebhook(raw)?.post?.id).toBe("zp_1");
    expect(isZernioDeliveryEvent("post.published")).toBe(true);
    expect(isZernioDeliveryEvent("profile.updated")).toBe(false);
  });

  test("verifies the raw request body", () => {
    const raw = '{"id":"evt_1","event":"webhook.test"}';
    const signature = createHmac("sha256", "secret").update(raw).digest("hex");
    expect(verifyZernioWebhookSignature(raw, signature, "secret")).toBe(true);
    expect(verifyZernioWebhookSignature(`${raw} `, signature, "secret")).toBe(
      false,
    );
  });
});
