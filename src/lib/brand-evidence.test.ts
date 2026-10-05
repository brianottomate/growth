import { expect, test } from "bun:test";
import { requireBrandStory, requirePersonaEvidence } from "./brand-evidence";
import { brandStoryDraftPrompt } from "@/server/ai/prompts/brand-story";
import { brandMarketsDraftPrompt } from "@/server/ai/prompts/markets";

test("insufficient or blank story drafts fail before replacing an existing brief", () => {
  expect(() =>
    requireBrandStory({
      status: "insufficient_evidence",
      story: "",
      reason: "Import homes or add site content.",
    }),
  ).toThrow("Import homes or add site content");
  expect(() =>
    requireBrandStory({ status: "ready", story: " ", reason: "" }),
  ).toThrow("Not enough evidence");
  expect(
    requireBrandStory({
      status: "ready",
      story: " Local hosts for group trips. ",
      reason: "",
    }),
  ).toBe("Local hosts for group trips.");
});

test("missing persona evidence fails, while an already covered audience can have no additions", () => {
  expect(() =>
    requirePersonaEvidence(
      {
        suggestions: [],
        insufficientEvidence: true,
        reason: "Add guest occasions.",
      },
      2,
    ),
  ).toThrow("Add guest occasions");
  expect(() =>
    requirePersonaEvidence(
      { suggestions: [], insufficientEvidence: false, reason: "" },
      0,
    ),
  ).toThrow("Not enough evidence");
  expect(() =>
    requirePersonaEvidence(
      { suggestions: [], insufficientEvidence: false, reason: "" },
      2,
    ),
  ).not.toThrow();
  expect(() =>
    requirePersonaEvidence(
      {
        suggestions: [{ name: "Groups" }],
        insufficientEvidence: false,
        reason: "",
      },
      0,
    ),
  ).not.toThrow();
});

test("missing About alone is allowed and destinations remain grounded in home towns without a story", () => {
  const story = brandStoryDraftPrompt({
    brandName: "Test",
    website: null,
    identity: "{}",
    homes: "[]",
    guestQuotes: "",
  });
  expect(story.prompt).toContain("missing About page alone is not a failure");
  expect(story.system).toContain("insufficient_evidence");
  const markets = brandMarketsDraftPrompt({
    brandName: "Test",
    website: null,
    story: "",
    towns: "Birmingham",
  });
  expect(markets.system).toContain(
    "imported home towns are the required source of truth",
  );
  expect(markets.prompt).toContain("Birmingham");
});
