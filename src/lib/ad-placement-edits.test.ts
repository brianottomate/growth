import { describe, expect, test } from "bun:test";

import type { AdPlacements } from "@/server/db/ads-schema";

import {
  isEmptyCell,
  withCard,
  withCopy,
  withFrozen,
  withoutKey,
  withUnfrozen,
} from "./ad-placement-edits";

// These pin the write rules the service verbs and the agent tools compose:
// a null clears an override, a cell that decides nothing is dropped so
// clearing the last override leaves no trace, a frozen cell is never dropped,
// and unfreeze keeps the files. Getting pruning wrong leaves ghost cells that
// read as "overridden" forever; getting freeze wrong ships or drops a locked
// creative.

const FEED = "meta_ads:facebook_feed" as const;
const STORY = "meta_ads:story" as const;

describe("withCopy", () => {
  test("writes an override on an empty map", () => {
    const next = withCopy({}, FEED, { headline: "Feed headline" });
    expect(next[FEED]?.copy).toEqual({ headline: "Feed headline" });
  });

  test("merges fields and leaves untouched ones alone", () => {
    const one = withCopy({}, FEED, { headline: "H" });
    const two = withCopy(one, FEED, { body: "B" });
    expect(two[FEED]?.copy).toEqual({ headline: "H", body: "B" });
  });

  test("a null clears one field back to the base", () => {
    const one = withCopy({}, FEED, { headline: "H", body: "B" });
    const two = withCopy(one, FEED, { headline: null });
    expect(two[FEED]?.copy).toEqual({ body: "B" });
  });

  test("clearing the last override drops the cell entirely", () => {
    const one = withCopy({}, FEED, { headline: "H" });
    const two = withCopy(one, FEED, { headline: null });
    expect(two[FEED]).toBeUndefined();
    expect(Object.keys(two)).toHaveLength(0);
  });

  test("does not mutate the input map", () => {
    const before: AdPlacements = {};
    withCopy(before, FEED, { headline: "H" });
    expect(before).toEqual({});
  });
});

describe("withCard", () => {
  const variant = {
    url: "https://img/feed.jpg",
    type: "image" as const,
    via: "upload" as const,
  };

  test("sets one card and pads the array to the card count", () => {
    const next = withCard({}, FEED, 1, variant, 3);
    expect(next[FEED]?.cards).toEqual([null, variant, null]);
  });

  test("clearing the only card drops the cell", () => {
    const one = withCard({}, FEED, 0, variant, 2);
    const two = withCard(one, FEED, 0, null, 2);
    expect(two[FEED]).toBeUndefined();
  });

  test("an out-of-range index throws", () => {
    expect(() => withCard({}, FEED, 3, variant, 2)).toThrow();
  });

  test("a card and a copy override coexist in one cell", () => {
    const one = withCopy({}, FEED, { headline: "H" });
    const two = withCard(one, FEED, 0, variant, 1);
    expect(two[FEED]?.copy).toEqual({ headline: "H" });
    expect(two[FEED]?.cards).toEqual([variant]);
  });
});

describe("withFrozen / withUnfrozen", () => {
  test("freeze stamps the cell and pins copy and cards", () => {
    const next = withFrozen({}, FEED, {
      at: "2026-09-15T22:00:00.000Z",
      by: "usr_1",
      copy: { headline: "Locked" },
      cards: [{ url: "https://img/pinned.jpg", type: "image", via: "render" }],
    });
    expect(next[FEED]?.frozenAt).toBe("2026-09-15T22:00:00.000Z");
    expect(next[FEED]?.frozenBy).toBe("usr_1");
    expect(next[FEED]?.copy).toEqual({ headline: "Locked" });
    expect(next[FEED]?.cards?.[0]?.url).toBe("https://img/pinned.jpg");
  });

  test("a frozen cell with no copy or cards is still kept, never pruned", () => {
    const next = withFrozen({}, STORY, {
      at: "2026-09-15T22:00:00.000Z",
      by: "usr_1",
    });
    expect(next[STORY]?.frozenAt).toBeDefined();
    expect(isEmptyCell(next[STORY]!)).toBe(false);
  });

  test("unfreeze removes the stamp but keeps the files", () => {
    const frozen = withFrozen({}, FEED, {
      at: "2026-09-15T22:00:00.000Z",
      by: "usr_1",
      cards: [{ url: "https://img/pinned.jpg", type: "image", via: "render" }],
    });
    const thawed = withUnfrozen(frozen, FEED);
    expect(thawed[FEED]?.frozenAt).toBeUndefined();
    expect(thawed[FEED]?.cards?.[0]?.url).toBe("https://img/pinned.jpg");
  });

  test("unfreeze of a cell whose only content was the stamp drops it", () => {
    const frozen = withFrozen({}, STORY, {
      at: "2026-09-15T22:00:00.000Z",
      by: "usr_1",
    });
    const thawed = withUnfrozen(frozen, STORY);
    expect(thawed[STORY]).toBeUndefined();
  });

  test("unfreeze is a no-op on a cell that is not frozen", () => {
    const overridden = withCopy({}, FEED, { headline: "H" });
    expect(withUnfrozen(overridden, FEED)).toEqual(overridden);
  });
});

describe("withoutKey", () => {
  test("drops the key and does not touch the input", () => {
    const before = withCopy({}, FEED, { headline: "H" });
    const after = withoutKey(before, FEED);
    expect(after[FEED]).toBeUndefined();
    expect(before[FEED]).toBeDefined();
  });
});
