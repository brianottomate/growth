import { describe, expect, test } from "bun:test";

import { cleanCompanyEmailText } from "./hubspot-company-email-copy";

describe("cleanCompanyEmailText", () => {
  test("keeps names and company facts while removing direct contact data", () => {
    const cleaned = cleanCompanyEmailText(
      [
        "Hi Ryan,",
        "Cascadia's Guesty inventory is the useful part.",
        "ryan@example.com · (971) 350-1869 · https://example.com/private",
      ].join("\n"),
    );

    expect(cleaned).toContain("Ryan");
    expect(cleaned).toContain("Cascadia");
    expect(cleaned).toContain("Guesty");
    expect(cleaned).toContain("[email]");
    expect(cleaned).toContain("[phone]");
    expect(cleaned).toContain("[link]");
    expect(cleaned).not.toContain("ryan@example.com");
    expect(cleaned).not.toContain("971");
    expect(cleaned).not.toContain("https://");
  });

  test("drops quoted reply history", () => {
    const cleaned = cleanCompanyEmailText(
      "Can you show me the MCP?\n\nOn Thu, Jul 23, 2026 at 4:00 PM Alex wrote:\nOld pitch",
    );
    expect(cleaned).toBe("Can you show me the MCP?");
  });
});
