import { expect, test } from "bun:test";
import {
  catalogArtworkIssues,
  catalogDraft,
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
  expect(draft.cards[1]?.templateId).toBe("catalog-copy");
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
  expect(draft.cards[0]?.templateId).toBe("catalog-copy");
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
