import { describe, expect, it } from "bun:test";

import { campaignCodenameOf } from "./campaign-codename.service";

describe("campaignCodenameOf", () => {
  it("reads the codename a house name ends with", () => {
    expect(
      campaignCodenameOf(
        "META_PERF+LEGACY+RNR_SALES_PURCHASE_202609_pink_otter",
      ),
    ).toBe("pink_otter");
  });

  it("finds none on a name without one", () => {
    expect(
      campaignCodenameOf("META_PERF+LEGACY+RNR_SALES_PURCHASE_202609"),
    ).toBeNull();
  });
});
