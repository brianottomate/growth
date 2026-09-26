import { expect, test } from "bun:test";
import {
  catalogArtworkIssues,
  catalogCardCopy,
  catalogCardFingerprint,
  catalogDraft,
  catalogHeadlineIssue,
  catalogLocation,
  catalogUnapproved,
  catalogExportRows,
  catalogFeedCsv,
} from "./catalog-studio";
const homes = [
  {
    id: "123456789012345678",
    name: 'A "quiet" home',
    url: "https://example.com/home",
    imageUrl: "https://example.com/photo.jpg",
    city: "Sonoma",
    state: "CA",
    guests: 8,
  },
  {
    id: "2",
    name: "Other",
    url: "https://example.com/other",
    imageUrl: "https://example.com/other.jpg",
  },
];
test("a card is its defaults until its row overrides a field", () => {
  const draft = catalogDraft(
    homes,
    new Map([
      [
        homes[0]!.id,
        { title: "Edited headline", excluded: true, subtitle: null },
      ],
    ]),
  );
  expect(draft.cards[0]?.title).toBe("Edited headline");
  expect(draft.cards[0]?.included).toBe(false);
  // A null override is the default, not an empty line.
  expect(draft.cards[0]?.subtitle).toBe("8 guests");
  expect(draft.cards[1]?.included).toBe(true);
  expect(draft.cards[1]?.templateId).toBe("catalog-place");
});
test("a card draws on the home's hero unless it has its own library image", () => {
  const own = { assetId: "media_1", url: "https://media.example.com/own.jpg" };
  const draft = catalogDraft(homes, new Map([[homes[1]!.id, { image: own }]]));
  expect(draft.cards[0]?.imageUrl).toBe(homes[0]!.imageUrl);
  expect(draft.cards[0]?.assetId).toBeUndefined();
  expect(draft.cards[1]?.imageUrl).toBe(own.url);
  expect(draft.cards[1]?.assetId).toBe(own.assetId);
});
test("export has one row per included home and uses its frozen primary artwork", () => {
  const draft = catalogDraft(homes);
  draft.formats = ["portrait", "story"];
  draft.cards[1]!.included = false;
  const assets = [
    {
      homeId: homes[0]!.id,
      name: "A",
      assetId: "1",
      url: "https://media.example.com/frozen.png",
      format: "portrait",
    },
    {
      homeId: homes[0]!.id,
      name: "A",
      assetId: "2",
      url: "https://media.example.com/story.png",
      format: "story",
    },
  ];
  const rows = catalogExportRows(homes, draft, assets, "Brand");
  expect(rows).toHaveLength(1);
  expect(rows[0]?.imageUrl).toBe(assets[0]!.url);
  expect(rows[0]?.id).toBe(homes[0]!.id);
  const csv = catalogFeedCsv(rows);
  expect(csv).toContain("hotel_id,name");
  expect(csv).toContain('A ""quiet"" home');
  expect(csv).not.toContain(homes[0]!.imageUrl);
  homes[0]!.name = "Changed later";
  draft.cards[0]!.title = "Changed later";
  expect(rows[0]?.title).toBe('A "quiet" home');
  expect(() => catalogExportRows(homes, draft, [], "Brand")).toThrow(
    "frozen primary image",
  );
});
test("finished artwork keeps the composition underneath it", () => {
  const finished = {
    assetId: "original",
    url: "https://example.com/finished.png",
  };
  const draft = catalogDraft(
    homes,
    new Map([[homes[0]!.id, { mode: "finished" as const, finished }]]),
  );
  expect(draft.cards[0]?.finishedArtwork).toEqual({
    ...finished,
    format: "portrait",
  });
  expect(draft.cards[0]?.imageUrl).toBe(homes[0]!.imageUrl);
  expect(draft.cards[0]?.templateId).toBe("catalog-place");
  expect(catalogArtworkIssues(draft)).toEqual([]);
});
test("finished artwork requires an original and cannot silently generate other export sizes", () => {
  const draft = catalogDraft(homes);
  const card = draft.cards[0]!;
  card.mode = "finished";
  expect(catalogArtworkIssues(draft)).toHaveLength(1);
  card.finishedArtwork = {
    assetId: "original",
    url: "https://example.com/finished.png",
    format: "portrait",
  };
  draft.formats = ["portrait", "story"];
  expect(catalogArtworkIssues(draft)).toHaveLength(1);
  card.included = false;
  expect(catalogArtworkIssues(draft)).toEqual([]);
  card.included = true;
  card.mode = "compose";
  expect(catalogArtworkIssues(draft)).toEqual([]);
});

test("catalog-place splits the headline into lead-in and place", () => {
  const card = {
    homeId: "h",
    included: true,
    imageUrl: "https://example.com/a.jpg",
    templateId: "catalog-place" as const,
    title: "Speakeasy-Chic Suite in Louisville, KY",
    subtitle: "4 bedrooms",
    imagePosition: "center" as const,
    showLogo: true,
    rating: 4.9,
  };
  expect(catalogCardCopy(card)).toEqual({
    eyebrow: "Speakeasy-Chic Suite in",
    title: "Louisville, KY",
    subtitle: "4 bedrooms",
    rating: 4.9,
  });
  // No " in ": the whole headline is the place line.
  expect(catalogCardCopy({ ...card, title: "Louisville, KY" }).title).toBe(
    "Louisville, KY",
  );
  // Other templates draw the headline whole.
  expect(catalogCardCopy({ ...card, templateId: "catalog-copy" }).title).toBe(
    card.title,
  );
});

test("an unedited card says only what is never wrong", () => {
  const draft = catalogDraft(homes);
  expect(draft.cards[0]?.title).toBe("Sleeps 8 in Sonoma, CA");
  expect(draft.cards[1]?.title).toBe("Vacation home");
});
test("approval holds until what the card shows changes", () => {
  const signed = catalogDraft(homes).cards[0]!;
  const approvals = new Map([[signed.homeId, catalogCardFingerprint(signed)]]);
  const draft = catalogDraft(homes, new Map(), approvals);
  expect(draft.cards[0]?.approved).toBe(true);
  // The second home was never signed, so it alone holds the export.
  expect(catalogUnapproved(draft).map((c) => c.homeId)).toEqual(["2"]);
  const edited = catalogDraft(
    homes,
    new Map([[signed.homeId, { title: "Shower for two in Sonoma, CA" }]]),
    approvals,
  );
  expect(edited.cards[0]?.approved).toBe(false);
});
test("an excluded card never holds the export", () => {
  const draft = catalogDraft(homes, new Map([["2", { excluded: true }]]));
  expect(catalogUnapproved(draft).map((c) => c.homeId)).toEqual([homes[0]!.id]);
});
test("finished artwork stays approved when fields it does not draw change", () => {
  const finished = {
    mode: "finished" as const,
    finished: { assetId: "art_1", url: "https://media.example.com/art.png" },
  };
  const signed = catalogDraft(homes, new Map([["2", finished]])).cards[1]!;
  const approvals = new Map([["2", catalogCardFingerprint(signed)]]);
  const retitled = catalogDraft(
    homes,
    new Map([["2", { ...finished, title: "New headline" }]]),
    approvals,
  );
  expect(retitled.cards[1]?.approved).toBe(true);
  const newArt = catalogDraft(
    homes,
    new Map([
      [
        "2",
        { ...finished, finished: { ...finished.finished, assetId: "art_2" } },
      ],
    ]),
    approvals,
  );
  expect(newArt.cards[1]?.approved).toBe(false);
});

test("a catalog-place headline the card cannot draw is refused, others pass", () => {
  const long = `${"Soaking tub ".repeat(4).trim()} in Louisville, KY`;
  expect(catalogHeadlineIssue(long, "catalog-place")).toContain("too long");
  expect(
    catalogHeadlineIssue(
      "50 private acres & lake view in Louisville, KY",
      "catalog-place",
    ),
  ).toBeNull();
  expect(catalogHeadlineIssue(long, "catalog-copy")).toBeNull();
});

test("a card names its confirmed market, never a draft", () => {
  const home = { ...homes[0]!, city: "Logan", state: "OH" };
  const markets = {
    markets: [{ id: "hh", label: "Hocking Hills, Ohio", towns: ["Logan"] }],
  };
  expect(catalogLocation(home, markets)).toBe("Logan, OH");
  expect(catalogLocation(home, { ...markets, confirmedAt: "2026-09-26" })).toBe(
    "Hocking Hills, Ohio",
  );
});
