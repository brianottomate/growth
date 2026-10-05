import type { MessageSendSnapshot } from "./email-delivery";
import { describe, expect, test } from "bun:test";
import {
  assertCustomerIoDeliveryTarget,
  assertProductUpdateReadyForDelivery,
  customerIoBroadcastData,
} from "./email-delivery";
const snapshot: MessageSendSnapshot = {
  schema: "wander-growth.message-send.v1",
  format: "newsletter.broadcast",
  revision: 3,
  email: {
    subject: "This week in WanderOS",
    preheader: "Three customer-facing improvements",
    bodyMarkdown: "The product update.",
    bodyHtml: "<p>The product update.</p>",
    ctaLabel: "Read the release notes",
    ctaUrl: "https://www.wander.com",
    templateKey: "os.marketing.operator.product-update",
  },
  audience: {
    kind: "wanderos_operators",
    provider: "customerio",
    segmentId: 42,
    label: "Live WanderOS customers",
  },
  productUpdate: null,
  preview: {
    renderer: "@wandercom/design-system-emails",
    template: "generic.html",
    html: "<html>preview</html>",
    text: "preview",
  },
};
describe("customerIoBroadcastData", () => {
  test("exposes approved content without copying recipients or preview HTML", () => {
    const data = customerIoBroadcastData("msg_123", snapshot);
    expect(data).toEqual({
      schema: "wander-growth.customerio-broadcast.v1",
      messageSendId: "msg_123",
      growth: {
        format: "newsletter.broadcast",
        revision: 3,
        audienceKind: "wanderos_operators",
        email: snapshot.email,
      },
    });
    expect(JSON.stringify(data)).not.toContain("segmentId");
    expect(JSON.stringify(data)).not.toContain("<html>");
    expect(data.growth.email.bodyHtml).toBe("<p>The product update.</p>");
  });
});
describe("assertProductUpdateReadyForDelivery", () => {
  const productUpdate = {
    periodStart: "2026-07-13T00:00:00.000Z",
    periodEnd: "2026-07-15T23:59:59.000Z",
    changes: [
      {
        repository: "wandercom/app.wander.com",
        ref: "3e09cbd1",
        title: "Safer page URL changes",
        summary: "The Site Editor can create a redirect after a slug change.",
        category: "improved" as const,
        releaseStatus: "shipped" as const,
        shippedAt: "2026-07-15T10:37:22.000Z",
      },
    ],
  };
  test("rejects the wrong audience and merged-only evidence", () => {
    expect(() =>
      assertProductUpdateReadyForDelivery({
        productUpdate,
        audienceKind: "subscribers",
      }),
    ).toThrow("only target the operator audience");
    expect(() =>
      assertProductUpdateReadyForDelivery({
        productUpdate: {
          ...productUpdate,
          changes: [
            {
              ...productUpdate.changes[0]!,
              releaseStatus: "merged",
              shippedAt: null,
            },
          ],
        },
        audienceKind: "wanderos_operators",
      }),
    ).toThrow("Verify these changes as shipped");
  });
});
describe("assertCustomerIoDeliveryTarget", () => {
  const broadcast = {
    type: "api",
    state: "running",
    active: true,
  };
  const dynamicSegment = {
    type: "dynamic",
    state: "finished",
  };
  test("rejects a normal campaign and a manual product-update segment", () => {
    expect(() =>
      assertCustomerIoDeliveryTarget({
        broadcast: {
          ...broadcast,
          type: "event",
        },
        segment: dynamicSegment,
      }),
    ).toThrow("API-triggered broadcast");
    expect(() =>
      assertCustomerIoDeliveryTarget({
        productUpdate: {
          periodStart: "2026-07-13T00:00:00.000Z",
          periodEnd: "2026-07-15T23:59:59.000Z",
          changes: [],
        },
        broadcast,
        segment: {
          type: "manual",
          state: "finished",
        },
      }),
    ).toThrow("require a dynamic Customer.io segment");
  });
});
