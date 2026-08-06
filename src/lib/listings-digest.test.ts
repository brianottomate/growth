import { describe, expect, test } from "bun:test";

import { parseDigestRow, splitPastedRow } from "./listings-digest";

/**
 * Fixtures are verbatim lines from the August planning sheet. The parser exists
 * to save a weekly transcription, so the contract it has to hold is "the rows
 * the team actually writes", not a tidied-up grammar.
 */

const ROW = `Aug 8, 2026\tSat\tFriends getaway / group travel\tWraps up summer travel with friends before schedules get busy\t"AUSTIN + HILL COUNTRY, TX
  * [OPERATED (Joel photos)] Wander Austin Grove (Austin) | sleeps 18 | $584/nt = ~$32/person
  - [Listed] Wander Austin Bluffs (Austin) | sleeps 16 | $664/nt = ~$42/person
  - [Listed] Private Turf Golf Course - Birdie Creek Ranch (Dripping Springs) | sleeps 18 | $1,315/nt = ~$73/person

TAHOE + TRUCKEE, CA
  * [OPERATED (Joel photos)] Wander Truckee Woods (Truckee) | sleeps 12 | $722/nt = ~$60/person
  - [Listed] Wander Tahoe Meadow (South Lake Tahoe) | sleeps 32 | $6,720/nt = ~$210/person"\t"AUSTIN + HILL COUNTRY, TX
https://www.wander.com/property/wander-austin-grove
https://www.wander.com/property/wander-austin-bluffs
https://www.wander.com/property/birdie-creek-ranch-private-golf-course-resort-692121566699323442

TAHOE + TRUCKEE, CA
https://www.wander.com/property/wander-truckee-woods
https://www.wander.com/property/wander-tahoe-meadow"\t`;

describe("splitPastedRow", () => {
  test("reads the sheet's columns through quoted multi-line cells", () => {
    const input = splitPastedRow(ROW);
    expect(input.theme).toBe("Friends getaway / group travel");
    expect(input.rationale).toBe(
      "Wraps up summer travel with friends before schedules get busy",
    );
    expect(input.properties).toContain("AUSTIN + HILL COUNTRY, TX");
    expect(input.links).toContain("wander-austin-grove");
  });

  test("falls back to treating a bare block as the properties cell", () => {
    const input = splitPastedRow(
      "TAHOE + TRUCKEE, CA\n  * [OPERATED] Wander Truckee Woods (Truckee) | sleeps 12 | $722/nt",
    );
    expect(input.properties).toContain("Wander Truckee Woods");
    expect(input.links).toBeNull();
  });
});

describe("parseDigestRow", () => {
  test("parses a full row into regions, homes, prices and links", () => {
    const { digest, unparsedLines } = parseDigestRow(splitPastedRow(ROW));
    expect(unparsedLines).toEqual([]);
    expect(digest?.sections).toHaveLength(2);

    const austin = digest!.sections[0]!;
    expect(austin.heading).toBe("AUSTIN + HILL COUNTRY, TX");
    expect(austin.properties).toHaveLength(3);

    const hero = austin.properties[0]!;
    expect(hero.operated).toBe(true);
    expect(hero.name).toBe("Wander Austin Grove");
    expect(hero.city).toBe("Austin");
    expect(hero.sleeps).toBe(18);
    expect(hero.nightlyUsd).toBe(584);
    expect(hero.perPersonUsd).toBe(32);
    expect(hero.href).toBe(
      "https://www.wander.com/property/wander-austin-grove",
    );

    // Listed homes are not heroes, and thousands separators must survive.
    expect(austin.properties[1]!.operated).toBe(false);
    expect(austin.properties[2]!.nightlyUsd).toBe(1315);
  });

  test("keeps a hyphen inside a property name off the bullet parser", () => {
    const { digest } = parseDigestRow(splitPastedRow(ROW));
    expect(digest!.sections[0]!.properties[2]!.name).toBe(
      "Private Turf Golf Course - Birdie Creek Ranch",
    );
  });

  test("keeps names that contain pipes, and still finds the city", () => {
    const { digest } = parseDigestRow({
      properties: `STOWE + VERMONT
  - [Listed] Treehouse 413| The Alpine | 3 Bed (Stowe) | sleeps 10 | $771/nt = ~$77/person
  - [Listed] Sunset Ridge | Luxury Wine Country Retreat (Santa Rosa) | sleeps 8 | $1,277/nt = ~$160/person`,
    });
    const [treehouse, ridge] = digest!.sections[0]!.properties;
    expect(treehouse!.name).toBe("Treehouse 413 | The Alpine | 3 Bed");
    expect(treehouse!.city).toBe("Stowe");
    expect(ridge!.name).toBe("Sunset Ridge | Luxury Wine Country Retreat");
    expect(ridge!.city).toBe("Santa Rosa");
  });

  test("zips links positionally, because slugs disagree with display names", () => {
    // "Green Reef 2" links to wander-destin-palms in the real sheet. Matching
    // on name would drop it; the operator's own ordering is the pairing.
    const { digest } = parseDigestRow({
      properties: `EMERALD + FORGOTTEN COAST, FL
  - [Listed] Green Reef 2 (Destin) | sleeps 14 | $895/nt = ~$64/person`,
      links: `EMERALD + FORGOTTEN COAST, FL
https://www.wander.com/property/wander-destin-palms`,
    });
    expect(digest!.sections[0]!.properties[0]!.href).toBe(
      "https://www.wander.com/property/wander-destin-palms",
    );
  });

  test("reports lines it could not place instead of dropping them", () => {
    const { digest, unparsedLines } = parseDigestRow({
      properties: `TAHOE + TRUCKEE, CA
  * [OPERATED] Wander Truckee Woods (Truckee) | sleeps 12 | $722/nt
  * [OPERATED]`,
    });
    expect(digest!.sections[0]!.properties).toHaveLength(1);
    expect(unparsedLines).toEqual(["* [OPERATED]"]);
  });

  test("returns no digest when nothing parsed, rather than an empty shell", () => {
    const { digest } = parseDigestRow({ properties: "just some prose" });
    expect(digest).toBeNull();
  });
});
