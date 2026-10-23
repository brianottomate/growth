import { expect, it } from "bun:test";
import { importEmailListAction } from "./email-audiences";

const validInput = {
  brandId: "brand_fixture",
  name: "Fixture guests",
  fileName: "guests.csv",
  consentConfirmed: true as const,
  rows: [
    {
      email: "guest@example.com",
      firstName: "Guest",
      sourceId: "row-1",
    },
  ],
};

it("requires explicit consent and at least one bounded row", () => {
  expect(importEmailListAction.inputSchema.safeParse(validInput).success).toBe(
    true,
  );
  expect(
    importEmailListAction.inputSchema.safeParse({
      ...validInput,
      consentConfirmed: false,
    }).success,
  ).toBe(false);
  expect(
    importEmailListAction.inputSchema.safeParse({
      ...validInput,
      rows: [],
    }).success,
  ).toBe(false);
});

it("rejects recipient rows from the aggregate-only output contract", () => {
  const output = {
    audience: {
      id: "eaud_fixture",
      brandId: validInput.brandId,
      name: validInput.name,
      definition: {
        source: "list",
        listId: "elist_fixture",
        clickedWithinDays: null,
        guestKinds: ["bookers", "signups"],
        consentConfirmed: true,
        sampleSize: null,
      },
      createdAt: "2026-10-22T00:00:00.000Z",
      updatedAt: "2026-10-22T00:00:00.000Z",
      recipientCount: 1,
    },
    imported: 1,
    invalid: 0,
    duplicates: 0,
    namesCleared: 0,
  };

  expect(importEmailListAction.outputSchema.safeParse(output).success).toBe(
    true,
  );
  expect(
    importEmailListAction.outputSchema.safeParse({
      ...output,
      rows: validInput.rows,
    }).success,
  ).toBe(false);
});
