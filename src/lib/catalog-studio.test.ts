import { expect, test } from "bun:test";
import {
  catalogArtworkIssues,
  catalogDraft,
  catalogDraftSchema,
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
test("catalog edits survive listing refresh and new homes start included", () => {
  const initial = catalogDraft(homes.slice(0, 1));
  initial.cards[0]!.title = "Edited headline";
  initial.cards[0]!.included = false;
  const next = catalogDraft(homes, initial);
  expect(next.cards[0]?.title).toBe("Edited headline");
  expect(next.cards[0]?.included).toBe(false);
  expect(next.cards[1]?.included).toBe(true);
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
test("primary feed format must be included", () => {
  const draft = catalogDraft(homes);
  draft.primaryFormat = "story";
  expect(catalogDraftSchema.safeParse(draft).success).toBe(false);
});

test("finished artwork survives refresh without replacing the saved composition", () => {
  const draft = catalogDraft(homes);
  const card = draft.cards[0]!;
  card.mode = "finished";
  card.finishedArtwork = {
    assetId: "original",
    url: "https://example.com/finished.png",
    format: "portrait",
  };
  const saved = catalogDraftSchema.parse(draft);
  const refreshed = catalogDraft(homes, saved);
  expect(refreshed.cards[0]?.finishedArtwork).toEqual(card.finishedArtwork);
  expect(refreshed.cards[0]?.imageUrl).toBe(homes[0]!.imageUrl);
  expect(refreshed.cards[0]?.templateId).toBe("catalog-copy");
  expect(catalogArtworkIssues(refreshed)).toEqual([]);
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
