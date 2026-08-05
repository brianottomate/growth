import { describe, expect, test } from "bun:test";

import {
  buildAmplificationSlackMessage,
  isSlackMemberId,
} from "./amplification-slack";

describe("amplification Slack handoff", () => {
  test("accepts Slack member ids and rejects handles", () => {
    expect(isSlackMemberId("U012ABCDEF")).toBe(true);
    expect(isSlackMemberId("@ceo")).toBe(false);
  });

  test("formats a tagged, actionable request", () => {
    const message = buildAmplificationSlackMessage({
      slackUserId: "U012ABCDEF",
      recipientRole: "coordinator",
      amplifierName: "The CEO",
      actionKind: "quote",
      brandName: "Wander",
      platform: "linkedin",
      title: "Summer launch",
      draftText: "A useful launch. <!channel>",
      workUrl: "https://growth.example/app/content/post_1",
    });

    expect(message.text).toContain("<@U012ABCDEF>");
    expect(message.text).toContain("quote-post");
    expect(message.text).toContain("ask The CEO");
    expect(message.text).toContain("Summer launch");
    expect(message.text).not.toContain("<!channel>");
    expect(message.text).toContain("Open the Growth work item");
  });
});
