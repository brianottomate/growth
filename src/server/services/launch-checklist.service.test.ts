import { expect, test } from "bun:test";
import type { Database } from "@/server/db";
import type { PerformanceChecklist } from "@/lib/performance-checklist";
import { recordLaunchChecklist } from "./launch-checklist.service";

function boundary(stored: PerformanceChecklist | null, missing = false) {
  let written: PerformanceChecklist | undefined;
  const client = {
    query: {
      brandTable: {
        findFirst: async () =>
          missing ? undefined : { performanceChecklist: stored },
      },
      userTable: { findFirst: async () => ({ name: "Micaela" }) },
    },
    update: () => ({
      set: ({
        performanceChecklist,
      }: {
        performanceChecklist: PerformanceChecklist;
      }) => ({
        where: () => ({
          returning: async () => {
            written = performanceChecklist;
            return [{ id: "brand" }];
          },
        }),
      }),
    }),
  } as unknown as Database;
  return { client, written: () => written };
}
const request = {
  brandId: "brand",
  orgId: "org",
  source: "manual" as const,
  by: "operator",
  patch: [
    { item: "intake" as const, checked: true },
    { item: "budget" as const, checked: true },
  ],
};

test("bulk milestone updates preserve tracker fields and stamp the authenticated actor", async () => {
  const db = boundary({ values: { monthlyFee: 2500 }, meta: {} });
  const saved = await recordLaunchChecklist({ ...request, client: db.client });
  expect(saved.revision).toBe(1);
  expect(saved.items.budget?.by).toBe("operator");
  expect(saved.items.budget?.byName).toBe("Micaela");
  expect(saved.items.intake?.at).toBe(saved.items.budget?.at);
  expect(db.written()?.values?.monthlyFee).toBe(2500);
});

test("an unavailable scoped brand cannot receive checklist updates", async () => {
  const db = boundary(null, true);
  const error = await recordLaunchChecklist({
    ...request,
    client: db.client,
  }).catch((error: unknown) => error);
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toContain("Brand not found");
  expect(db.written()).toBeUndefined();
});
