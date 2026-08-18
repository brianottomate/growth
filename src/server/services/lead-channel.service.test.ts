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

describe("scoreLeadChannel enrolment target", () => {
  /**
   * The mauiwestside.com pick. The scrape found `info@`, which is a fine
   * mailbox to write to and the wrong person to enrol: the greeting would have
   * read "Hi Maui Westside Properties," while Walt Kubiak, Owner, sat in the
   * same candidate list.
   */
  test("enrols the highest-scoring person, not the scraped role inbox", () => {
    const scored = scoreLeadChannel({
      domain: "mauiwestside.com",
      contactChannel: {
        domain: "mauiwestside.com",
        companyName: "Maui Westside Properties",
        emails: ["info@mauiwestside.com", "walt@mauiwestside.com"],
        corporate: ["info@mauiwestside.com", "walt@mauiwestside.com"],
        roleInbox: ["info@mauiwestside.com"],
        siteFreemail: [],
        hasForm: false,
        bestEmail: "info@mauiwestside.com",
        route: "instantly",
        pagesOk: 3,
      },
      contacts: [
        contact({
          id: "lc_info",
          email: "info@mauiwestside.com",
          firstName: "Maui Westside Properties",
          lastName: "- Mainline",
        }),
        contact({
          id: "lc_walt",
          email: "walt@mauiwestside.com",
          firstName: "Walt",
          lastName: "Kubiak",
          jobTitle: "Airbnb Host + Owner",
        }),
      ],
    });

    expect(scored.bestEmail).toBe("info@mauiwestside.com");
    expect(scored.enrollable?.email).toBe("walt@mauiwestside.com");
    expect(scored.enrollable?.contactId).toBe("lc_walt");
  });

  /**
   * The mckennalodging.com pick, which disabled the button entirely: the scrape
   * selected an address with no `lead_contact` behind it, so nothing was
   * enrollable even though the owner was stored under a different mailbox.
   */
  test("falls back to a stored contact when the scraped address has no row", () => {
    const scored = scoreLeadChannel({
      domain: "mckennalodging.com",
      contactChannel: {
        domain: "mckennalodging.com",
        companyName: "McKenna Lodging",
        emails: ["maxx@mckennalodging.com"],
        corporate: ["maxx@mckennalodging.com"],
        roleInbox: [],
        siteFreemail: [],
        hasForm: false,
        bestEmail: "maxx@mckennalodging.com",
        route: "instantly",
        pagesOk: 2,
      },
      contacts: [
        contact({
          id: "lc_maxx",
          email: "maxxmckenna@gmail.com",
          firstName: "Maxx",
          lastName: "McKenna",
          jobTitle: "Owner",
        }),
      ],
    });

    expect(scored.enrollable?.contactId).toBe("lc_maxx");
  });

  /** Retiring is what hands the company to the next candidate after a bounce. */
  test("skips a retired contact and picks the next in line", () => {
    const scored = scoreLeadChannel({
      domain: "bolewoodcapital.com",
      contactChannel: null,
      contacts: [
        contact({
          id: "lc_eric",
          email: "eric@bolewoodcapital.com",
          firstName: "Eric",
          lastName: "Sedlacek",
          jobTitle: "Business Analyst",
          retiredAt: "2026-08-18T00:00:00.000Z",
          retiredReason: "bounced",
        }),
        contact({
          id: "lc_joshua",
          email: "joshua@bolewoodcapital.com",
          firstName: "joshua",
        }),
      ],
    });

    expect(scored.enrollable?.contactId).toBe("lc_joshua");
  });

  /** With everyone retired there is no next in line, and nothing to enrol. */
  test("has no enrolment target when every contact is retired", () => {
    const scored = scoreLeadChannel({
      domain: "bolewoodcapital.com",
      contactChannel: null,
      contacts: [
        contact({
          id: "lc_eric",
          email: "eric@bolewoodcapital.com",
          firstName: "Eric",
          retiredAt: "2026-08-18T00:00:00.000Z",
          retiredReason: "bounced",
        }),
      ],
    });

    expect(scored.enrollable).toBeNull();
  });
});
