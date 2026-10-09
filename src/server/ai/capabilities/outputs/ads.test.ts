import { expect, it } from "bun:test";
import { projectIdea, type IdeaDocument } from "@/lib/ad-idea-studio";
import {
  draftAdActionOutputSchema,
  setPlatformDraftActionOutputSchema,
} from "./ads";

it("accepts projected creative copy with descriptions and cleared booking targets", () => {
  const copy = {
    headline: "Your downtown home base",
    body: "City views 🏙️",
    description: "4 bedrooms · Sleeps 8",
    linkUrl: "https://example.com/stay",
    callToAction: "BOOK_NOW",
    bookingTargetId: null,
  };
  const document: IdeaDocument = {
    role: "hero_static",
    shapes: ["square", "story", "wide"],
    cards: [
      {
        id: "card_fixture",
        mode: "compose",
        source: { url: "https://example.com/image.png" },
        recipe: {
          templateId: "email-header",
          title: "City views",
          subtitle: "",
          eyebrow: "",
          cta: "",
          showLogo: false,
          imagePosition: "center",
        },
        overrides: {
          wide: {
            templateId: "tier-badge",
            title: "City views",
            subtitle: "",
            eyebrow: "",
            cta: "",
            showLogo: false,
            imagePosition: "center",
          },
        },
      },
    ],
    copy,
    copyOverrides: { story: { ...copy, body: "Soaking tub 🛁" } },
  };
  const projected = projectIdea(
    "brand_fixture",
    { headline: "", body: "", media: [] },
    { document },
    null,
  );
  const parsed = draftAdActionOutputSchema
    .pick({ content: true, placements: true })
    .parse(projected);
  expect(parsed.content).toMatchObject({
    description: copy.description,
    bookingTargetId: null,
    body: copy.body,
  });
  expect(parsed.placements?.["meta_ads:story"]?.copy).toMatchObject({
    description: copy.description,
    bookingTargetId: null,
    body: "Soaking tub 🛁",
  });
});

it("returns a saved Meta goal and planning-only Studio references", () => {
  const result = setPlatformDraftActionOutputSchema.parse({
    id: "pcamp_fixture",
    platform: "meta_ads",
    budget: null,
    budgetType: null,
    startAt: null,
    endAt: null,
    settings: {
      meta: { goal: "conversions" },
      previewAdIds: ["ad_studio_draft"],
    },
  });
  expect(result.settings?.meta?.goal).toBe("conversions");
  expect(result.settings?.previewAdIds).toEqual(["ad_studio_draft"]);
});
