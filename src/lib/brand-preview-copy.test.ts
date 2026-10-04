import { expect, test } from "bun:test";
import {
  brandPreviewCopySchema,
  brandPreviewFields,
} from "./brand-preview-copy";

const copy = {
  headline: "Room for your kind of trip",
  supportingLine: "Find a stay that fits your plans.",
  cta: "Find your stay",
};
test("sample creatives use the generated copy in the fields their template supports", () => {
  expect(
    brandPreviewFields({ title: "Brand", subtitle: "", eyebrow: "" }, copy),
  ).toEqual({
    title: copy.headline,
    subtitle: copy.supportingLine,
    eyebrow: "",
  });
  expect(
    brandPreviewFields(
      { title: "Brand", cta: "Explore your next escape" },
      copy,
    ),
  ).toEqual({ title: copy.headline, cta: copy.cta });
});
test("older marks without sample copy still preview", () => {
  expect(
    brandPreviewFields({ title: "Brand", subtitle: "" }, undefined),
  ).toEqual({ title: "Brand", subtitle: "" });
});
test("generated sample copy must fit the small creative previews", () => {
  expect(brandPreviewCopySchema.safeParse(copy).success).toBe(true);
  expect(
    brandPreviewCopySchema.safeParse({ ...copy, headline: "x".repeat(49) })
      .success,
  ).toBe(false);
  expect(brandPreviewCopySchema.safeParse({ ...copy, cta: " " }).success).toBe(
    false,
  );
});
