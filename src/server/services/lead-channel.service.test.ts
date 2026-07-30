import { describe, expect, test } from "bun:test";

import {
  isPlaceholderEmail,
  scoreLeadChannel,
  scoreStoredContact,
  type StoredLeadContact,
} from "./lead-channel.service";

const contact = (
  overrides: Partial<StoredLeadContact> & { email: string },
): StoredLeadContact => ({
  id: "ldc_test",
  firstName: null,
  lastName: null,
  jobTitle: null,
  ...overrides,
});

describe("isPlaceholderEmail", () => {
  test("matches the placeholder mailboxes HubSpot appends", () => {
    expect(isPlaceholderEmail("230402084130@fake-email.com")).toBe(true);
    expect(isPlaceholderEmail("someone@fakeemail.com")).toBe(true);
    expect(isPlaceholderEmail("QA@Test.com")).toBe(true);
    expect(isPlaceholderEmail("  x@mailinator.com  ")).toBe(true);
  });

  /**
   * The reason this is an exact-domain check and not a substring search: real
   * prospects in the universe contain "test" and "example" inside their names.
   * A substring match would silently zero live companies.
   */
  test("does not match real prospect domains that contain those words", () => {
    expect(isPlaceholderEmail("hello@corporatestays.com")).toBe(false);
    expect(isPlaceholderEmail("hello@elevatestr.com")).toBe(false);
    expect(isPlaceholderEmail("hello@whitestay.com")).toBe(false);
    expect(isPlaceholderEmail("hello@divergentestates.com")).toBe(false);
    expect(isPlaceholderEmail("charlief@fisher3e.com")).toBe(false);
  });
});

describe("scoreStoredContact", () => {
  /**
   * The exact fisher3vacations.com row that rendered as a reviewable candidate:
   * a placeholder address carrying a first name and a decision-maker title,
   * which the additive scorer rated 55 — level with the real corporate contact.
   */
  test("hard-zeroes a placeholder address despite a name and a founder title", () => {
    const scored = scoreStoredContact(
      contact({
        email: "230402084130@fake-email.com",
        firstName: "Megan",
        jobTitle: "Co-founder",
      }),
      "fisher3vacations.com",
    );

    expect(scored.score).toBe(0);
    expect(scored.verdict).toBe("skip");
    // "has a named person" must not read as evidence for a mailbox that cannot
    // receive mail.
    expect(scored.reasons).toEqual([]);
    expect(scored.risks.join(" ")).toContain("placeholder mailbox");
  });

  test("still scores the real corporate contact on the same company", () => {
    const scored = scoreStoredContact(
      contact({
        email: "charlief@fisher3e.com",
        firstName: "Charlie",
        lastName: "Fisher",
        jobTitle: "Partner",
      }),
      "fisher3vacations.com",
    );

    expect(scored.score).toBeGreaterThan(0);
    expect(scored.reasons).toContain("has a named person");
  });
});

describe("scoreLeadChannel", () => {
  test("does not select a placeholder as the channel when it is the only contact", () => {
    // skywatercabins.com: one contact, and it is a placeholder.
    const scored = scoreLeadChannel({
      domain: "skywatercabins.com",
      contactChannel: null,
      contacts: [
        contact({
          email: "55889823108@fake-email.com",
          firstName: "Skywater Cabins",
          lastName: "- Mainline",
        }),
      ],
    });

    expect(scored.bestEmail).toBeNull();
    expect(scored.verdict).toBe("skip");
    // Still visible to the reviewer, with the reason it was rejected.
    expect(scored.candidates).toHaveLength(1);
    expect(scored.candidates[0]!.risks.join(" ")).toContain("placeholder");
  });

  test("prefers the real contact over a higher-titled placeholder", () => {
    const scored = scoreLeadChannel({
      domain: "fisher3vacations.com",
      contactChannel: null,
      contacts: [
        contact({
          email: "230402084130@fake-email.com",
          firstName: "Megan",
          jobTitle: "Co-founder",
        }),
        contact({
          email: "charlief@fisher3e.com",
          firstName: "Charlie",
          lastName: "Fisher",
          jobTitle: "Partner",
        }),
      ],
    });

    expect(scored.bestEmail).toBe("charlief@fisher3e.com");
  });
});
