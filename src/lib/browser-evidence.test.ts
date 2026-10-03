import { expect, test } from "bun:test";
import {
  browserEvidenceRunSchema,
  canonicalEvidenceUrl,
} from "./browser-evidence";
const capture = {
  platform: "twitter",
  url: "https://x.com/reader/status/123",
  author: "reader",
  observedAt: "2026-10-03T12:01:00Z",
  evidence: "Asked about a booking website",
  decision: "engage",
  rationale: "Relevant question",
  draft: "Here is a useful resource",
};
const run = {
  brandId: "brand_test",
  runKey: "run1",
  startedAt: "2026-10-03T12:00:00Z",
  finishedAt: "2026-10-03T12:05:00Z",
  outcome: "completed",
  report: "One relevant question observed",
  captures: [capture],
};
test("public identities discard tracking and reject credentials or unrelated hosts", () => {
  expect(
    canonicalEvidenceUrl(
      "https://twitter.com/Reader/status/123?tracking=abc",
      "twitter",
    ),
  ).toBe("https://x.com/reader/status/123");
  expect(
    canonicalEvidenceUrl(
      "https://www.instagram.com/reel/ABC/?comment_id=42",
      "instagram",
    ),
  ).toBe("https://www.instagram.com/p/ABC/c/42/");
  for (const url of [
    "https://x.com.evil.test/reader/status/123",
    "https://user:pass@x.com/reader/status/123",
    "http://x.com/reader/status/123",
  ])
    expect(() => canonicalEvidenceUrl(url, "twitter")).toThrow();
});
test("a draft remains distinct from a posted receipt", () => {
  expect(
    browserEvidenceRunSchema.parse(run).captures[0]?.receipt,
  ).toBeUndefined();
  const receipt = {
    url: "https://x.com/operator/status/456",
    parentUrl: capture.url,
    account: "operator",
    text: capture.draft,
    postedAt: "2026-10-03T12:02:00Z",
    authorization: "Operator approved this reply",
  };
  expect(
    browserEvidenceRunSchema.safeParse({
      ...run,
      captures: [{ ...capture, receipt }],
    }).success,
  ).toBe(true);
  for (const patch of [
    { account: "other" },
    { parentUrl: "https://x.com/reader/status/789" },
    { text: "Different reply" },
    { authorization: "" },
  ])
    expect(
      browserEvidenceRunSchema.safeParse({
        ...run,
        captures: [{ ...capture, receipt: { ...receipt, ...patch } }],
      }).success,
    ).toBe(false);
});
test("duplicate identities and observations outside the run are rejected", () => {
  expect(
    browserEvidenceRunSchema.safeParse({
      ...run,
      captures: [capture, { ...capture, url: `${capture.url}?source=other` }],
    }).success,
  ).toBe(false);
  expect(
    browserEvidenceRunSchema.safeParse({
      ...run,
      captures: [{ ...capture, observedAt: "2026-10-04T12:01:00Z" }],
    }).success,
  ).toBe(false);
});
