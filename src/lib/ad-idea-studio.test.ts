import { describe, expect, test } from "bun:test";
import {
  defaultIdeaRecipe,
  ideaDocumentFromAd,
  ideaDocumentSchema,
  projectIdea,
  ideaImagesSaved,
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
    ...ideaDocumentFromAd({
      name: "Hero carousel",
      content,
    }),
    shapes: ["portrait", "story"],
    cards: [
      {
        id: "one",
        source: {
          assetId: "asset-one",
          url: "https://example.com/photo.jpg",
        },
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
test("approval projects frozen assets into every delivery surface and reopening preserves recipes", () => {
  const document = draft();
  const approval = {
    approvedAt: "2026-09-21T00:00:00.000Z",
    approvedBy: "user",
    sourceVersion: "v1",
    renders: {
      portrait: [
        {
          assetId: "export-feed",
          url: "https://media.example/feed.png",
        },
      ],
      story: [
        {
          assetId: "export-story",
          url: "https://media.example/story.png",
        },
      ],
    },
  };
  const approved = projectIdea(
    "brand",
    content,
    {
      document,
      approval,
    },
    null,
  );
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
    {
      document,
    },
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
describe("saved approval images", () => {
  test("an approval counts as saved only when every size has every card", () => {
    const document = {
      ...draft(),
      shapes: ["portrait", "story"] as const,
    };
    const render = {
      assetId: "a",
      url: "https://cdn/x.png",
    };
    const approval = {
      approvedAt: "2026-09-29T00:00:00.000Z",
      approvedBy: "user",
      sourceVersion: "v1",
      renders: {
        portrait: [render],
      },
    };
    expect(
      ideaImagesSaved({
        document: {
          ...document,
          shapes: [...document.shapes],
        },
        approval,
      }),
    ).toBe(false);
    expect(
      ideaImagesSaved({
        document: {
          ...document,
          shapes: [...document.shapes],
        },
        approval: {
          ...approval,
          renders: {
            portrait: [render],
            story: [render],
          },
        },
      }),
    ).toBe(true);
    expect(
      ideaImagesSaved({
        document: draft(),
      }),
    ).toBe(false);
  });
});
test("changing only the second carousel card's Story image text preserves its feed and every other card", () => {
  const document = draft();
  document.cards.push({
    ...document.cards[0]!,
    id: "two",
    source: {
      url: "https://example.com/second.jpg",
    },
    overrides: {},
  });
  const before = projectIdea(
    "brand-one",
    content,
    {
      document,
    },
    null,
  );
  const next = ideaDocumentSchema.parse({
    ...document,
    cards: document.cards.map((card) =>
      card.id === "two"
        ? {
            ...card,
            overrides: {
              ...card.overrides,
              story: {
                ...card.recipe,
                title: "Gather above Main Street",
              },
            },
          }
        : card,
    ),
  });
  const saved = projectIdea(
    "brand-one",
    content,
    {
      document: next,
    },
    before.placements,
  );
  const reloaded = ideaDocumentFromAd({
    name: "Carousel",
    content: saved.content,
  });
  expect(saved.content.media[0]).toEqual(before.content.media[0]);
  expect(saved.content.media[1]?.url).toBe(before.content.media[1]?.url);
  expect(saved.content.media[1]?.story?.url).not.toBe(
    before.content.media[1]?.story?.url,
  );
  expect(reloaded.cards[1]?.recipe).toEqual(document.cards[1]?.recipe);
  expect(reloaded.cards[1]?.overrides.story?.title).toBe(
    "Gather above Main Street",
  );
  expect(reloaded.cards.map((card) => card.id)).toEqual(["one", "two"]);
  expect(reloaded.copy).toEqual(document.copy);
});
test("card booking links survive saving, approval and every placement projection", () => {
  const document = draft();
  document.cards[0]!.copy = {
    headline: "Explore this home",
    landingUrl:
      "https://www.chaletshh.com/s?unitIds=123&checkin=2026-11-15&checkout=2026-11-21",
    bookingTargetId: "btarget_pilot",
  };
  for (const approval of [
    undefined,
    {
      approvedAt: "2026-10-01T00:00:00Z",
      approvedBy: "user",
      sourceVersion: "v1",
      renders: {
        portrait: [
          {
            assetId: "feed",
            url: "https://example.com/feed.png",
          },
        ],
        story: [
          {
            assetId: "story",
            url: "https://example.com/story.png",
          },
        ],
      },
    },
  ]) {
    const projected = projectIdea(
      "brand-one",
      content,
      {
        document,
        approval,
      },
      null,
    );
    expect(projected.content.media[0]).toMatchObject(document.cards[0]!.copy);
    for (const placement of Object.values(projected.placements))
      expect(placement?.cards?.[0]).toMatchObject(document.cards[0]!.copy);
    expect(
      ideaDocumentFromAd({
        name: "Pilot",
        content: projected.content,
      }).cards[0]!.copy,
    ).toEqual(document.cards[0]!.copy);
  }
});
