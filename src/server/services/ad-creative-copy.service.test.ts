import { expect, test } from "bun:test";
import { defaultIdeaRecipe, ideaDocumentFromAd } from "@/lib/ad-idea-studio";
import { applyCreativeCopy } from "./ad-creative-copy.service";

// Scope mistakes overwrite operator wording outside the requested rewrite.
test("copy drafts isolate caption and image words while preserving creative settings", () => {
  const document = ideaDocumentFromAd({
    name: "Example",
    content: {
      format: "static",
      headline: "Original headline",
      body: "Original caption",
      linkUrl: "https://example.com/book",
      callToAction: "BOOK_NOW",
      media: [],
    },
  });
  document.cards = [
    {
      id: "one",
      mode: "compose",
      source: { assetId: "photo", url: "https://example.com/photo.jpg" },
      recipe: { ...defaultIdeaRecipe("hero_static"), title: "Original image" },
      copy: {
        headline: "Original card headline",
        description: "Original card description",
      },
      overrides: {
        story: { ...defaultIdeaRecipe("hero_static"), title: "Original story" },
      },
    },
  ];
  const original = structuredClone(document);
  const output = {
    copy: {
      headline: "New headline",
      body: "New caption",
      description: "New description",
    },
    cards: [
      {
        id: "one",
        base: {
          title: "New image",
          subtitle: "New subtitle",
          eyebrow: "New eyebrow",
        },
        copy: {
          headline: "New card headline",
          description: "New card description",
        },
        overrides: [
          {
            shape: "story" as const,
            words: {
              title: "New story",
              subtitle: "New subtitle",
              eyebrow: "New eyebrow",
            },
          },
        ],
      },
    ],
  };
  const caption = applyCreativeCopy(document, output, "caption");
  expect(caption.cards).toEqual(original.cards);
  expect(caption.copy.body).toBe("New caption");
  const image = applyCreativeCopy(document, output, "image");
  expect(image.copy).toEqual(original.copy);
  expect(image.copyOverrides).toEqual(original.copyOverrides);
  expect(image.cards[0]?.copy).toEqual(original.cards[0]?.copy);
  expect(image.cards[0]?.recipe.title).toBe("New image");
  expect(image.cards[0]?.overrides.story?.title).toBe("New story");
  for (const draft of [caption, image, applyCreativeCopy(document, output)]) {
    expect(draft.copy.linkUrl).toBe(original.copy.linkUrl);
    expect(draft.copy.callToAction).toBe(original.copy.callToAction);
    expect(draft.cards[0]?.source).toEqual(original.cards[0]?.source);
    expect(draft.cards[0]?.recipe.templateId).toBe(
      original.cards[0]?.recipe.templateId,
    );
  }
  expect(document).toEqual(original);
});
