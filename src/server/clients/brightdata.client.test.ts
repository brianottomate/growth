import { describe, expect, test } from "bun:test";

import { linkedinProfileDatasetFor } from "./brightdata-datasets";

describe("linkedinProfileDatasetFor", () => {
  test("uses the people dataset for personal profiles", () => {
    expect(
      linkedinProfileDatasetFor("https://www.linkedin.com/in/itsajchan/"),
    ).toBe("linkedinPersonProfile");
  });

  test("uses the company dataset for company pages", () => {
    expect(
      linkedinProfileDatasetFor(
        "https://www.linkedin.com/company/hackersquadio/",
      ),
    ).toBe("linkedinProfile");
  });
});
