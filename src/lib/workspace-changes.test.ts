import { expect, test } from "bun:test";
import { workspaceDomains, queryMatchesDomains } from "./workspace-changes";
test("operation and saved grouped receipts invalidate the same dependent domains", () => {
  expect(workspaceDomains("adsWrite__setAdCopy")).toEqual(
    workspaceDomains("adsWrite"),
  );
  const domains = workspaceDomains("adsWrite__setAdCopy");
  expect(
    queryMatchesDomains(
      [["ads", "getCampaign"], { input: { id: "campaign" } }],
      domains,
    ),
  ).toBe(true);
  expect(queryMatchesDomains([["lifecycle", "overview"]], domains)).toBe(false);
  expect(queryMatchesDomains([undefined], domains)).toBe(false);
});
