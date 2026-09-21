import { describe, expect, it } from "bun:test";

import { inboundLeadStatus } from "@/server/services/inbound-router.service";

describe("inboundLeadStatus", () => {
  it("qualifies a WanderOS inbound only at 10+ units", () => {
    expect(
      inboundLeadStatus("contact", {
        isListedSource: false,
        numberOfProperties: "10",
      }),
    ).toBe("MARKETING QUALIFIED LEAD");
    expect(
      inboundLeadStatus("company", {
        isListedSource: false,
        numberOfProperties: "25",
      }),
    ).toBe("MQL");
  });

  it("parks portfolios under 10 in the < 10 Homes hold status", () => {
    expect(
      inboundLeadStatus("contact", {
        isListedSource: false,
        numberOfProperties: "9",
      }),
    ).toBe("On Hold - Sites - Less than 6 Homes");
    expect(
      inboundLeadStatus("company", {
        isListedSource: false,
        numberOfProperties: "1",
      }),
    ).toBe("On Hold - Sites - Less than 6 Homes");
  });

  it("sends an unknown unit count to research instead of guessing MQL", () => {
    for (const n of ["", "0", "n/a"]) {
      expect(
        inboundLeadStatus("contact", {
          isListedSource: false,
          numberOfProperties: n,
        }),
      ).toBe("New Lead - Research Needed");
    }
  });

  it("leaves Listed inbounds on their own status regardless of size", () => {
    expect(
      inboundLeadStatus("contact", {
        isListedSource: true,
        numberOfProperties: "2",
      }),
    ).toBe("Listed Inbound");
    expect(
      inboundLeadStatus("company", {
        isListedSource: true,
        numberOfProperties: "50",
      }),
    ).toBe("Listed Inbound");
  });
});
