import { describe, expect, test } from "bun:test";

import {
  countContactMentions,
  storedContactMentions,
} from "@/server/services/lead-correspondence";

const barb = { email: "barb@x.com", firstName: "Barb", lastName: "Kubiak" };
const walt = { email: "walt@x.com", firstName: "Walt", lastName: "Kubiak" };

describe("countContactMentions", () => {
  test("separates two people who share a surname", () => {
    const counts = countContactMentions(
      [barb, walt],
      "Call with Walt Kubiak. Call with Walt Kubiak. Emailed Barb Kubiak.",
    );
    expect(counts).toEqual({ "walt@x.com": 2, "barb@x.com": 1 });
  });

  test("omits anyone the record never names", () => {
    expect(countContactMentions([barb], "Nobody by that name here.")).toEqual(
      {},
    );
  });

  // A two-letter first name would match inside ordinary words and hand that
  // contact a score nobody earned.
  test("skips first names too short to match safely", () => {
    const jo = { email: "jo@x.com", firstName: "Jo", lastName: null };
    expect(countContactMentions([jo], "Jo joined the job in Johannesburg."))
      .toEqual({});
  });
});

describe("storedContactMentions", () => {
  // "Never ranked" and "never contacted" must not collapse: returning an empty
  // map would silently zero the signal for every unranked domain.
  test("returns undefined when the domain has no stored summary", () => {
    expect(storedContactMentions(null)).toBeUndefined();
    expect(storedContactMentions({ leadRank: {} })).toBeUndefined();
  });

  test("reads counts off a stored enrichment blob", () => {
    const map = storedContactMentions({
      correspondence: { contactMentions: { "walt@x.com": 5 } },
    });
    expect(map?.get("walt@x.com")).toBe(5);
  });
});
