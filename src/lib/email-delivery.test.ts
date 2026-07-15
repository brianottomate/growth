import { describe, expect, test } from "bun:test";

import {
  customerIoBroadcastData,
  type MessageSendSnapshot,
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
