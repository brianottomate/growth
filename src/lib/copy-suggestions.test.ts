import { expect, test } from "bun:test";
import {
  copySuggestionApplyMessage,
  copySuggestionsDataSchema,
} from "./copy-suggestions";

const adTarget = { surface: "ad" as const, brandId: "brand-1", adId: "ad-2" };
const options = ["Group weekend", "Slow morning", "City base"].map((label) => ({
  label,
  rationale: "A different supported angle",
  edits: [
    {
      kind: "composition" as const,
      cardId: "slide-2",
      shape: "story" as const,
      title: label,
    },
  ],
}));

test("selection carries only the chosen words and the exact nested target", () => {
  const data = copySuggestionsDataSchema.parse({ target: adTarget, options });
  const chosen = data.options[1]!;
  const message = copySuggestionApplyMessage(data.target, chosen);
  expect(JSON.parse(message.split("\n\n")[1]!)).toEqual({
    target: adTarget,
    edits: [
      {
        kind: "composition",
        cardId: "slide-2",
        shape: "story",
        title: "Slow morning",
      },
    ],
  });
  expect(message).toContain("Read its current state first");
  expect(message).toContain("Do not regenerate");
  expect(message).not.toContain("Group weekend");
});

test("proposals reject mismatched surfaces, ambiguous duplicate targets and empty edits", () => {
  expect(
    copySuggestionsDataSchema.safeParse({
      target: { surface: "catalog", brandId: "b", homeId: "h" },
      options,
    }).success,
  ).toBe(false);
  expect(
    copySuggestionsDataSchema.safeParse({
      target: adTarget,
      options: options.map((option) => ({
        ...option,
        edits: [...option.edits, ...option.edits],
      })),
    }).success,
  ).toBe(false);
  expect(
    copySuggestionsDataSchema.safeParse({
      target: adTarget,
      options: options.map((option) => ({
        ...option,
        edits: [{ kind: "ad", shape: null }],
      })),
    }).success,
  ).toBe(false);
  expect(
    copySuggestionsDataSchema.safeParse({
      target: adTarget,
      options: options.slice(0, 2),
    }).success,
  ).toBe(false);
});

test("catalog headline and pills remain one selectable set", () => {
  const data = copySuggestionsDataSchema.parse({
    target: { surface: "catalog", brandId: "b", homeId: "h" },
    options: options.map((option) => ({
      ...option,
      edits: [
        {
          kind: "catalog",
          title: option.label,
          pills: ["Rooftop deck", "City view"],
        },
      ],
    })),
  });
  const message = copySuggestionApplyMessage(data.target, data.options[0]!);
  expect(JSON.parse(message.split("\n\n")[1]!)).toEqual({
    target: data.target,
    edits: data.options[0]!.edits,
  });
});

// Blank proposals used to render as choices that the catalog write rejected.
test("catalog suggestions share editor constraints while optional text can be cleared", () => {
  const target = { surface: "catalog", brandId: "b", homeId: "h" };
  const proposal = (edit: Record<string, unknown>) => ({
    target,
    options: options.map((option) => ({
      ...option,
      edits: [{ kind: "catalog", ...edit }],
    })),
  });
  for (const edit of [
    { title: "   " },
    { pills: ["   "] },
    { title: "x".repeat(121) },
    { adHeadline: "" },
  ])
    expect(copySuggestionsDataSchema.safeParse(proposal(edit)).success).toBe(
      false,
    );
  expect(
    copySuggestionsDataSchema.parse(
      proposal({ subtitle: "", pills: [], adDescription: "" }),
    ).options[0]!.edits[0],
  ).toEqual({ kind: "catalog", subtitle: "", pills: [], adDescription: "" });
});
