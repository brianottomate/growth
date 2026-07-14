import assert from "node:assert/strict";

import { describe, test } from "bun:test";

import { formatEmailImplementationHandoff } from "./email-document";

describe("formatEmailImplementationHandoff", () => {
  test("exports a deterministic product implementation brief", () => {
    const markdown = formatEmailImplementationHandoff({
      subject: "Summer escapes worth the flight",
      preheader: "A fresh collection of remarkable Wander homes",
      bodyMarkdown: "Plan less.\n\nStay somewhere **extraordinary**.",
      ctaLabel: "Explore Wander homes",
      ctaUrl: "https://www.wander.com/?utm_source=resend&utm_medium=email",
      templateKey: "editorial",
      handoffTargetRepo: "wander-web",
      brandName: "Wander",
      brandSlug: "wander",
      contentTitle: "Summer escapes",
      contentPostId: "cp_1",
      platformPostId: "pp_1",
      format: "newsletter.blast",
      revision: 3,
      plannedAt: "2026-07-20T09:00:00.000Z",
      seriesName: "Wander weekly",
    });

    assert.match(markdown, /schema: wander-growth\.email-handoff\.v1/);
    assert.match(markdown, /targetRepo: "wander-web"/);
    assert.match(markdown, /Subject: Summer escapes worth the flight/);
    assert.match(markdown, /## Product-runtime responsibilities/);
    assert.match(markdown, /Resolve recipients and eligibility/);
    assert.match(
      markdown,
      new RegExp(
        "https://www\\.wander\\.com/\\?utm_source=resend&utm_medium=email",
      ),
    );
  });

  test("does not invent or export recipient and credential data", () => {
    const markdown = formatEmailImplementationHandoff({
      subject: "Test",
      bodyMarkdown: "Body",
      templateKey: "editorial",
      brandName: "Wander",
      contentTitle: "Test email",
      contentPostId: "cp_2",
      platformPostId: "pp_2",
      format: "newsletter.broadcast",
      revision: 1,
    });

    assert.doesNotMatch(markdown, /RESEND_API_KEY=/);
    assert.doesNotMatch(markdown, /recipients:/);
    assert.match(
      markdown,
      /Do not copy recipient lists, credentials, or provider secrets into Wander Growth\./,
    );
  });
});
