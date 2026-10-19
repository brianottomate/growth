import { expect, test } from "bun:test";
import { submitIntakeSchema } from "./performance-intake.service";

// A public brand slug must never authorize a submitted client intake.
test("intake submission requires its onboarding credential", () => {
  expect(
    submitIntakeSchema.safeParse({ slug: "winter-park-escapes", answers: {} })
      .success,
  ).toBe(false);
  expect(
    submitIntakeSchema.safeParse({
      token: "test-onboarding-credential",
      answers: {},
    }).success,
  ).toBe(true);
});
