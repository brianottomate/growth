import { describe, expect, test } from "bun:test";

import type { AdCreativeContent } from "@/server/db/ads-schema";

import {
  AD_PLACEMENT_SPECS,
  cellState,
  coverage,
  LEGACY_STORY_KEY,
  type PlaceableAd,
  placementSpec,
  resolveCell,
  resolveMatrix,
} from "./ad-placements";

// The rules these pin are the ones the matrix and the push both depend on:
// an absent cell renders the base, a cell's copy and files win over the base
// per field and per card, frozen outranks overridden, and an ad drawn before
// the map still resolves its story slot. A wrong answer here ships the wrong
// creative or hides a decision someone made.

const base: AdCreativeContent = {
  format: "carousel",
  headline: "Your private Hocking Hills escape",
  body: "Cabins with hot tubs, minutes from the trails.",
  callToAction: "Book now",
  linkUrl: "https://www.chaletshh.com",
  propertyName: "Sycamore",
  media: [
    { url: "https://img/one.jpg", type: "image", assetId: "media_1" },
    {
      url: "https://img/two.jpg",
      type: "image",
      assetId: "media_2",
      story: { url: "https://img/two-story.jpg", type: "image", via: "crop" },
    },
  ],
};

const feed = placementSpec("meta_ads:facebook_feed")!;
const story = placementSpec(LEGACY_STORY_KEY)!;

describe("resolveCell", () => {
  test("an ad with no placements renders the base into every cell", () => {
    const cells = resolveMatrix({ content: base, placements: null });
    expect(cells).toHaveLength(AD_PLACEMENT_SPECS.length);
    const fb = cells.find((cell) => cell.key === feed.key)!;
    expect(fb.state).toBe("rendered");
    expect(fb.copy.headline).toBe(base.headline);
    expect(fb.cards.map((card) => card.via)).toEqual(["base", "base"]);
    expect(fb.frozenAt).toBeNull();
  });

  test("a selective copy edit changes one cell and leaves the base alone", () => {
    const ad = {
      content: base,
      placements: {
        [feed.key]: { copy: { headline: "Feed-only headline" } },
      },
    };
    const fb = resolveCell(ad, feed);
    const ig = resolveCell(ad, placementSpec("meta_ads:instagram_feed")!);
    expect(fb.state).toBe("overridden");
    expect(fb.copy.headline).toBe("Feed-only headline");
    // Unset fields inherit; the body was never overridden.
    expect(fb.copy.body).toBe(base.body);
    expect(ig.state).toBe("rendered");
    expect(ig.copy.headline).toBe(base.headline);
  });

  test("a cell's own file wins for that card only; the rest crop the base", () => {
    const ad: PlaceableAd = {
      content: base,
      placements: {
        [feed.key]: {
          cards: [
            null,
            { url: "https://img/two-feed.jpg", type: "image", via: "upload" },
          ],
        },
      },
    };
    const fb = resolveCell(ad, feed);
    expect(fb.cards[0]).toMatchObject({
      url: "https://img/one.jpg",
      via: "base",
    });
    expect(fb.cards[1]).toMatchObject({
      url: "https://img/two-feed.jpg",
      via: "upload",
    });
  });

  test("frozen outranks overridden and carries its timestamp", () => {
    const ad = {
      content: base,
      placements: {
        [feed.key]: {
          copy: { headline: "Locked" },
          frozenAt: "2026-09-15T20:00:00.000Z",
          frozenBy: "usr_1",
        },
      },
    };
    const fb = resolveCell(ad, feed);
    expect(fb.state).toBe("frozen");
    expect(fb.frozenAt).toBe("2026-09-15T20:00:00.000Z");
    expect(fb.copy.headline).toBe("Locked");
  });

  test("an entry with nothing decided in it still renders", () => {
    expect(cellState({})).toBe("rendered");
    expect(cellState({ cards: [null, null] })).toBe("rendered");
    expect(cellState({ copy: {} })).toBe("rendered");
  });
});

describe("legacy story slot", () => {
  test("card.story resolves as the story cell so old ads look unchanged", () => {
    const st = resolveCell({ content: base, placements: null }, story);
    expect(st.state).toBe("overridden");
    expect(st.cards[0]?.via).toBe("base");
    expect(st.cards[1]).toMatchObject({
      url: "https://img/two-story.jpg",
      via: "crop",
    });
    // Other placements do not inherit the story file.
    const fb = resolveCell({ content: base, placements: null }, feed);
    expect(fb.cards[1]?.url).toBe("https://img/two.jpg");
  });

  test("an explicit story entry wins over the legacy slot", () => {
    const ad: PlaceableAd = {
      content: base,
      placements: {
        [LEGACY_STORY_KEY]: {
          cards: [
            { url: "https://img/one-story.jpg", type: "image", via: "render" },
            null,
          ],
        },
      },
    };
    const st = resolveCell(ad, story);
    expect(st.cards[0]).toMatchObject({ url: "https://img/one-story.jpg" });
    // The legacy file on card two is not consulted once the map has the key.
    expect(st.cards[1]).toMatchObject({
      url: "https://img/two.jpg",
      via: "base",
    });
  });
});

describe("copy fit", () => {
  test("flags copy over the placement's limits and a missing required button", () => {
    const ad = {
      content: {
        ...base,
        headline: "x".repeat(41),
        body: "y".repeat(126),
        callToAction: undefined,
      },
      placements: null,
    };
    const fb = resolveCell(ad, feed);
    expect(fb.fit.ok).toBe(false);
    expect(fb.fit.issues).toEqual([
      "Headline 41/40",
      "Body 126/125",
      "No call to action",
    ]);
    // Stories do not require a button.
    expect(resolveCell(ad, story).fit.issues).not.toContain(
      "No call to action",
    );
  });

  test("copy within limits is fit", () => {
    expect(resolveCell({ content: base, placements: null }, feed).fit.ok).toBe(
      true,
    );
  });
});

describe("coverage", () => {
  test("counts each state and the unfit cells for the collapsed row", () => {
    const ad = {
      content: { ...base, headline: "x".repeat(41) },
      placements: {
        [feed.key]: { frozenAt: "2026-09-15T20:00:00.000Z" },
        "meta_ads:instagram_feed": { copy: { body: "Short." } },
      },
    };
    const cover = coverage(resolveMatrix(ad));
    expect(cover).toEqual({
      total: 3,
      frozen: 1,
      overridden: 2, // instagram by copy, story by the legacy slot
      rendered: 0,
      unfit: 3, // the long headline is inherited everywhere
    });
  });
});
