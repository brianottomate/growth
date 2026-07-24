import { describe, expect, test } from "bun:test";

import { findPregenHubspotDraftViolations } from "./pregen-hubspot-draft-policy";

const draft = (opening: string, closing: string) => ({
  touches: [
    { opening, closing },
    { opening: "Touch 2.", closing: "Touch 2 close." },
    { opening: "Touch 3.", closing: "Touch 3 close." },
    { opening: "Touch 4.", closing: "Touch 4 close." },
  ],
});

describe("findPregenHubspotDraftViolations", () => {
  test("accepts a grounded fresh opening with a brief introduction", () => {
    expect(
      findPregenHubspotDraftViolations(
        draft(
          "I was looking through Maui Kai's site and noticed how clearly you explain the direct-booking benefits. I'm with WanderOS, the direct-booking platform from the team behind Wander.com, and our team prepared a private concept using Maui Kai's actual inventory.",
          "The search and property pages work, but nothing can be booked. Worth a quick look together?",
        ),
        { motion: "fresh", pms: null },
      ),
    ).toEqual([]);
  });

  test("rejects recipient attribution and unsupported preview claims", () => {
    const violations = findPregenHubspotDraftViolations(
      draft(
        "Ryan, you asked about MCP. I'm with WanderOS, and the preview pulls live from Guesty.",
        "The attached preview answers the technical question and includes checkout.",
      ),
      { motion: "reengagement", pms: "Guesty" },
    );

    expect(violations).toContain(
      "The draft is company-level; do not address a correspondent or attribute company history to the eventual recipient.",
    );
    expect(violations).toContain(
      "Do not claim that the preview pulls from, syncs with, or was generated from Guesty.",
    );
    expect(violations).toContain(
      "The preview is linked in the email, not attached; do not describe an attachment.",
    );
    expect(violations).toContain(
      "Do not claim the private preview includes or demonstrates checkout.",
    );
    expect(violations).toContain(
      "Touch 1 must make clear that nothing in the private preview can be booked.",
    );
  });

  test("allows an explicit disclaimer that the preview does not answer technical questions", () => {
    expect(
      findPregenHubspotDraftViolations(
        draft(
          "Ryan asked about ChatGPT and MCP. I'm with WanderOS, and our team prepared a private concept using Cascadia's actual inventory.",
          "The preview does not answer the technical questions, and nothing can be booked. Worth talking through them together?",
        ),
        { motion: "reengagement", pms: "Guesty" },
      ),
    ).toEqual([]);
  });

  test("rejects calling the already-rendered preview link below from the closing", () => {
    expect(
      findPregenHubspotDraftViolations(
        draft(
          "I was looking through the site. I'm with WanderOS from the team behind Wander.com.",
          "The preview is linked below and nothing can be booked. Worth a quick look?",
        ),
        { motion: "fresh", pms: null },
      ),
    ).toContain(
      "The preview URL renders before the touch 1 closing; do not call it the link below from the closing.",
    );
  });
});
