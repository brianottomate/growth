import assert from "node:assert/strict";

import { describe, test } from "bun:test";

import {
  formatEmailImplementationHandoff,
  productUpdateContextSchema,
} from "./email-document";

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

  test("carries exact release evidence into the implementation handoff", () => {
    const markdown = formatEmailImplementationHandoff({
      subject: "This week in WanderOS",
      bodyMarkdown: "Site editing is getting safer and faster.",
      templateKey: "os.marketing.operator.product-update",
      brandName: "WanderOS",
      contentTitle: "WanderOS product update",
      contentPostId: "cp_3",
      platformPostId: "pp_3",
      format: "newsletter.broadcast",
      revision: 1,
      productUpdate: {
        periodStart: "2026-07-13T00:00:00.000Z",
        periodEnd: "2026-07-15T23:59:59.000Z",
        changes: [
          {
            repository: "wandercom/app.wander.com",
            ref: "3e09cbd1",
            url: "https://github.com/wandercom/app.wander.com/commit/3e09cbd1",
            title: "Safer page URL changes",
            summary:
              "The Site Editor can create a redirect after a slug change.",
            customerImpact:
              "Operators can rename pages without losing old links.",
            category: "improved",
            releaseStatus: "shipped",
            mergedAt: "2026-07-15T07:31:25.000Z",
            shippedAt: "2026-07-15T10:37:22.000Z",
          },
        ],
      },
    });

    assert.match(markdown, /## Product update evidence/);
    assert.match(markdown, /wandercom\/app\.wander\.com@3e09cbd1/);
    assert.match(markdown, /Release status: shipped/);
    assert.match(
      markdown,
      /Operators can rename pages without losing old links/,
    );
  });

  test("rejects inverted windows and unverified shipped evidence", () => {
    assert.throws(() =>
      productUpdateContextSchema.parse({
        periodStart: "2026-07-16T00:00:00.000Z",
        periodEnd: "2026-07-15T00:00:00.000Z",
        changes: [
          {
            repository: "wandercom/app.wander.com",
            ref: "3e09cbd1",
            title: "Safer page URL changes",
            summary:
              "The Site Editor can create a redirect after a slug change.",
            category: "improved",
            releaseStatus: "shipped",
          },
        ],
      }),
    );
  });
});
