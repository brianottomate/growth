import { expect, test } from "bun:test";
import { campaignOwnsExport } from "./campaign-media-cleanup.service";

test("campaign cleanup owns generated approval exports, including exports made before attaching an ad", () => {
  expect(campaignOwnsExport({ adApproval: { campaignId: "c" } }, "c", [])).toBe(
    true,
  );
  expect(
    campaignOwnsExport({ adApproval: { campaignId: null, adId: "a" } }, "c", [
      "a",
    ]),
  ).toBe(true);
  expect(
    campaignOwnsExport(
      { adApproval: { campaignId: "other", adId: "other" } },
      "c",
      ["a"],
    ),
  ).toBe(false);
  expect(campaignOwnsExport({ source: "listing" }, "c", ["a"])).toBe(false);
  expect(campaignOwnsExport(null, "c", ["a"])).toBe(false);
});
