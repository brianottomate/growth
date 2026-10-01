import { expect, test } from "bun:test";
import {
  applyCreativeCopy,
  creativeCopyProblem,
} from "./ad-creative-copy.service";
import { defaultIdeaRecipe, type IdeaDocument } from "@/lib/ad-idea-studio";
const recipe = {
  ...defaultIdeaRecipe("hero_static"),
  title: "River-view loft",
};
const document: IdeaDocument = {
  role: "home_carousel",
  shapes: ["square", "story"],
  copy: {
    headline: "Loft on Main Street",
    body: "Your loft weekend 🏡",
    description: "Sleeps 14",
    linkUrl: "https://example.com",
    callToAction: "Book now",
  },
  copyOverrides: {},
  cards: [
    {
      id: "one",
      mode: "compose",
      copy: {
        landingUrl: "https://example.com/book",
        bookingTargetId: "target-one",
      },
      source: { url: "https://example.com/one.jpg" },
      recipe,
      overrides: { story: { ...recipe, imagePosition: "left" } },
    },
    {
      id: "two",
      mode: "supplied",
      source: { url: "https://example.com/two.jpg" },
      recipe,
      overrides: {},
    },
  ],
};
const output = {
  copy: {
    headline: "Gather above Main Street",
    body: "Bring everyone to Louisville 🏡",
    description: "Six bedrooms",
  },
  cards: [
    {
      id: "one",
      base: { title: "A loft for your whole crew", eyebrow: "", subtitle: "" },
      copy: { headline: "Room to gather", description: "Six bedrooms" },
      overrides: [
        {
          shape: "story" as const,
          words: {
            title: "Your whole crew, one loft",
            eyebrow: "",
            subtitle: "",
          },
        },
      ],
    },
    {
      id: "two",
      base: {
        title: "Do not replace supplied artwork",
        eyebrow: "",
        subtitle: "",
      },
      copy: { headline: "Explore the loft", description: "Book direct" },
      overrides: [],
    },
  ],
};
test("a complete creative rewrite changes caption and image text while preserving sources, layouts, crops and supplied artwork", () => {
  const next = applyCreativeCopy(document, output);
  expect(creativeCopyProblem(document, output)).toBeNull();
  expect(next.copy.headline).toBe(output.copy.headline);
  expect(next.copy.linkUrl).toBe(document.copy.linkUrl);
  expect(next.cards.map((card) => card.id)).toEqual(["one", "two"]);
  expect(next.cards[0]?.copy?.landingUrl).toBe("https://example.com/book");
  expect(next.cards[0]?.copy?.bookingTargetId).toBe("target-one");
  expect(next.cards[0]?.source).toEqual(document.cards[0]?.source);
  expect(next.cards[0]?.recipe.templateId).toBe(recipe.templateId);
  expect(next.cards[0]?.recipe.cta).toBe(recipe.cta);
  expect(next.cards[0]?.overrides.story?.imagePosition).toBe("left");
  expect(next.cards[0]?.overrides.story?.title).toBe(
    "Your whole crew, one loft",
  );
  expect(next.cards[1]?.recipe).toEqual(document.cards[1]?.recipe);
  expect(next.cards[1]?.copy?.headline).toBe("Explore the loft");
});
test("regeneration rejects unchanged copy and invented or missing carousel cards", () => {
  expect(
    creativeCopyProblem(document, {
      ...output,
      copy: { ...output.copy, headline: document.copy.headline },
    }),
  ).toContain("repeats");
  expect(
    creativeCopyProblem(document, { ...output, cards: [output.cards[0]!] }),
  ).toContain("every current card");
  expect(
    creativeCopyProblem(document, {
      ...output,
      cards: [output.cards[0]!, { ...output.cards[1]!, id: "invented" }],
    }),
  ).toContain("every current card");
  expect(
    creativeCopyProblem(document, {
      ...output,
      cards: [{ ...output.cards[0]!, overrides: [] }, output.cards[1]!],
    }),
  ).toContain("override keys");
});
