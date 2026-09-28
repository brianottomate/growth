import { describe, expect, test } from "bun:test";

import { parseSeedList } from "./seed-list";

describe("parseSeedList", () => {
  test("reads Meta's template, where email repeats, by its first email column", () => {
    const parsed = parseSeedList(
      "email,email,phone,fn\nA@x.com,b@x.com,+1 650 561 5622,Ann\n",
    );
    expect(parsed.members).toEqual([
      { email: "a@x.com", phone: "+1 650 561 5622" },
    ]);
  });

  test("keeps quoted fields with commas intact and skips rows with nothing to match", () => {
    const parsed = parseSeedList(
      [
        "first_name,email,phone,qualifying_properties",
        'Raj,rdhinsa@hotmail.com,+15103250316,"Wander Sonoma Valley, Wander Sonoma Vineyards"',
        'Nobody,,n/a,"A, B"',
        "Phone only,,+14155551234,",
      ].join("\r\n"),
    );
    expect(parsed.rows).toBe(3);
    expect(parsed.members).toEqual([
      { email: "rdhinsa@hotmail.com", phone: "+15103250316" },
      { phone: "+14155551234" },
    ]);
  });

  test("dedupes repeated contacts so the upload count is people, not rows", () => {
    const parsed = parseSeedList("Email Address\nx@y.com\nX@Y.com\n");
    expect(parsed.emailColumn).toBe("Email Address");
    expect(parsed.members).toHaveLength(1);
  });
});
