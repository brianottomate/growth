import { describe, expect, test } from "bun:test";
import {
  defaultIdeaRecipe,
  ideaDocumentFromAd,
  ideaDocumentSchema,
  ideaPreviewUrl,
  projectIdea,
  ideaSource,
  withIdeaPool,
  ideaAwaitingArtwork,
} from "./ad-idea-studio";
import type { IdeaDocument } from "./ad-idea-studio";
import type { AdCreativeContent } from "@/server/db/ads-schema";

const content: AdCreativeContent = {
  format: "carousel",
  headline: "Ad headline",
  body: "Ad body",
  media: [],
};
function draft(): IdeaDocument {
  return {
    ...ideaDocumentFromAd({ name: "Hero carousel", content }),
    shapes: ["portrait", "story"],
    cards: [
      {
        id: "one",
        source: { assetId: "asset-one", url: "https://example.com/photo.jpg" },
        mode: "compose",
        recipe: {
          ...defaultIdeaRecipe("hero_carousel"),
          title: "On-image words",
        },
        overrides: {
          story: {
            ...defaultIdeaRecipe("hero_carousel"),
            templateId: "tall-welcome",
            title: "Story words",
            showLogo: false,
          },
        },
      },
    ],
  };
}
describe("editable ad ideas", () => {
  test("retains editable recipes and separate copy through save and reload", () => {
    const document = draft();
    const result = projectIdea("brand-one", content, { document }, null);
    expect(
      ideaDocumentFromAd({ name: "Hero carousel", content: result.content }),
    ).toEqual(withIdeaPool(document));
    expect(result.content.headline).toBe("Ad headline");
    expect(result.content.media[0]!.url).toContain("title=On-image+words");
    expect(result.content.media[0]!.story!.url).toContain("title=Story+words");
    expect(result.content.media[0]!.assetId).toBeUndefined();
  });
  test("uses shape overrides without changing other shapes or supplied artwork", () => {
    const card = draft().cards[0]!;
    const portrait = new URL(
      ideaPreviewUrl("brand-one", card, "portrait")!,
      "http://local",
    );
    const story = new URL(
      ideaPreviewUrl("brand-one", card, "story")!,
      "http://local",
    );
    expect(portrait.searchParams.get("templateId")).toBe("hero-overlay");
    expect(story.searchParams.get("templateId")).toBe("tall-welcome");
    expect(story.searchParams.get("mark")).toBe("none");
    expect(
      new URL(
        ideaPreviewUrl("brand-one", { ...card, mode: "supplied" }, "story")!,
        "http://local",
      ).searchParams.get("templateId"),
    ).toBe("photo-only");
  });
  test("a size-specific replacement leaves the base and other sizes alone", () => {
    const document = draft();
    const card = document.cards[0]!;
    const storySource = {
      assetId: "story-art",
      url: "https://example.com/story.jpg",
    };
    card.sourceOverrides = { story: storySource };
    expect(ideaSource(card, "portrait")).toEqual(card.source);
    expect(ideaSource(card, "story")).toEqual(storySource);
    const result = projectIdea("brand-one", content, { document }, null);
    expect(result.content.media[0]!.url).toContain(
      "sourceMediaAssetId=asset-one",
    );
    expect(result.content.media[0]!.story!.url).toContain(
      "sourceMediaAssetId=story-art",
    );
    expect(
      ideaDocumentSchema.parse(result.content.ideaStudio!.document).cards[0]!
        .sourceOverrides,
    ).toEqual({ story: storySource });
  });
  test("explicitly blank sizes survive saving, never preview a crop, and block readiness only when included", () => {
    const document = draft();
    const card = document.cards[0]!;
    card.sourceOverrides = { story: null };
    expect(ideaPreviewUrl("brand-one", card, "story")).toBeNull();
    expect(ideaAwaitingArtwork(document)).toBe(true);
    const result = projectIdea("brand-one", content, { document }, null);
    expect(result.content.media[0]!.url).toContain(
      "sourceMediaAssetId=asset-one",
    );
    expect(result.placements["meta_ads:story"]!.cards).toEqual([null]);
    expect(
      ideaDocumentFromAd({ name: "Hero", content: result.content }).cards[0]!
        .sourceOverrides!.story,
    ).toBeNull();
    document.shapes = ["portrait"];
    expect(ideaAwaitingArtwork(document)).toBe(false);
    delete card.sourceOverrides.story;
    expect(ideaSource(card, "story")).toEqual(card.source);
  });
  test("allows incomplete shells but rejects multiple static images and duplicate slides", () => {
    expect(
      ideaDocumentSchema.safeParse(
        ideaDocumentFromAd({ name: "Empty", content }),
      ).success,
    ).toBe(true);
    const doc = draft();
    doc.cards.push({ ...doc.cards[0]!, id: "two" });
    expect(
      ideaDocumentSchema.safeParse({ ...doc, role: "hero_static" }).success,
    ).toBe(false);
    doc.cards[1]!.id = "one";
    expect(ideaDocumentSchema.safeParse(doc).success).toBe(false);
  });
});

test("deselecting a slide retains its base and size artwork in the pool without duplicates", () => {
  const document = draft();
  document.cards[0]!.sourceOverrides = {
    story: { assetId: "story", url: "https://example.com/story.jpg" },
  };
  const normalized = withIdeaPool(document, [document.cards[0]!.source]);
  expect(normalized.pool).toHaveLength(2);
  const deselected = withIdeaPool({ ...normalized, cards: [] });
  expect(deselected.cards).toHaveLength(0);
  expect(deselected.pool).toEqual(normalized.pool);
  expect(ideaDocumentSchema.parse(deselected).pool).toHaveLength(2);
});
test("a pool can exceed the slide limit for both statics and carousels", () => {
  const pool = Array.from({ length: 45 }, (_, i) => ({
    url: `https://example.com/${i}.jpg`,
  }));
  for (const role of ["hero_static", "home_carousel"] as const) {
    const document = { ...draft(), role, pool };
    expect(ideaDocumentSchema.safeParse(document).success).toBe(true);
  }
});

test("approval projects frozen assets into every delivery surface and reopening preserves recipes", () => {
  const document = draft();
  const approval = {
    approvedAt: "2026-09-21T00:00:00.000Z",
    approvedBy: "user",
    sourceVersion: "v1",
    renders: {
      portrait: [
        { assetId: "export-feed", url: "https://media.example/feed.png" },
      ],
      story: [
        { assetId: "export-story", url: "https://media.example/story.png" },
      ],
    },
  };
  const approved = projectIdea("brand", content, { document, approval }, null);
  expect(approved.content.media[0]!.url).toBe(
    approval.renders.portrait[0]!.url,
  );
  expect(approved.content.media[0]!.story!.assetId).toBe("export-story");
  expect(approved.placements["meta_ads:instagram_feed"]!.cards![0]!.url).toBe(
    approval.renders.portrait[0]!.url,
  );
  expect(JSON.stringify(approved.placements)).not.toContain(
    "/api/compositions/preview",
  );
  const reopened = projectIdea(
    "brand",
    approved.content,
    { document },
    approved.placements,
  );
  expect(reopened.content.ideaStudio?.approval).toBeUndefined();
  expect(reopened.content.ideaStudio?.document).toEqual(document);
  expect(reopened.content.media[0]!.url).toContain("/api/compositions/preview");
});

test("a damaged approval never falls back to mutable preview URLs", () => {
  const result = projectIdea(
    "brand",
    content,
    {
      document: draft(),
      approval: {
        approvedAt: "now",
        approvedBy: "user",
        sourceVersion: "v1",
        renders: {},
      },
    },
    null,
  );
  expect(result.content.media).toEqual([]);
  expect(result.placements["meta_ads:story"]!.cards).toEqual([null]);
});

test("retains export selection independently of editable sizes and compositions", () => {
  const document = { ...draft(), exportShapes: ["square" as const] };
  const result = projectIdea("brand-one", content, { document }, null);
  const restored = ideaDocumentFromAd({
    name: "Hero",
    content: result.content,
  });
  expect(restored.exportShapes).toEqual(["square"]);
  expect(restored.shapes).toEqual(["portrait", "story"]);
  expect(restored.cards[0]?.overrides.story?.title).toBe("Story words");
  expect(
    ideaDocumentSchema.parse({ ...document, exportShapes: [] }).exportShapes,
  ).toEqual([]);
});

describe("Meta copy per card", () => {
  test("a card's own headline and description reach the ad; blanks inherit", () => {
    const document = draft();
    document.copy = {
      ...document.copy,
      description: "Sleeps 12 · private pool",
    };
    document.cards = [
      {
        ...document.cards[0]!,
        copy: { headline: "  The pool  ", description: "" },
      },
      { ...document.cards[0]!, id: "two" },
    ];
    const result = projectIdea("brand-one", content, { document }, null);
    expect(result.content.description).toBe("Sleeps 12 · private pool");
    expect(result.content.media[0]!.headline).toBe("The pool");
    expect(result.content.media[0]!.description).toBeUndefined();
    expect(result.content.media[1]!.headline).toBeUndefined();
  });

  test("clearing the description in the idea clears it on the ad", () => {
    const document = draft();
    const result = projectIdea(
      "brand-one",
      { ...content, description: "Old line" },
      {
        document: { ...document, copy: { ...document.copy, description: " " } },
      },
      null,
    );
    expect(result.content.description).toBeUndefined();
  });

  test("old documents without card copy still parse", () => {
    expect(ideaDocumentSchema.safeParse(draft()).success).toBe(true);
  });
});
