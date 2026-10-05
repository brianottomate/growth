import { expect, test } from "bun:test";
import { setPerformanceSettings } from "./performance-settings.service";
import type { Database } from "@/server/db";
import type { PerformanceSettings } from "@/server/db/brand-schema";
// The DB boundary returns the actual current settings; assertions protect
// partial operator updates, rather than query implementation details.
function settingsClient(settings: PerformanceSettings, conflict = false) {
  let written: PerformanceSettings | undefined;
  const client = {
    query: {
      brandTable: {
        findFirst: async () => ({
          id: "client",
          performanceSettings: settings,
        }),
      },
      userTable: {
        findFirst: async () => ({
          id: "operator",
          name: "Brooke",
          email: "brooke@example.com",
          image: "https://example.com/avatar.png",
        }),
      },
    },
    update: () => ({
      set: ({
        performanceSettings,
      }: {
        performanceSettings: PerformanceSettings;
      }) => ({
        where: () => ({
          returning: async () => {
            if (conflict) return [];
            written = performanceSettings;
            return [
              {
                id: "client",
              },
            ];
          },
        }),
      }),
    }),
  } as unknown as Database;
  return {
    client,
    written: () => written,
  };
}
test("a chat update to catalog keeps the recorded platform, payment, and journey", async () => {
  const stored = {
    pipelineStage: "onboarding",
    monthlyFee: 2666.67,
    cardState: {
      catalog: "Approved",
      meta: "Live",
      managementPayment: "Paid",
    },
  } as const;
  const boundary = settingsClient(stored);
  const result = await setPerformanceSettings({
    brandId: "client",
    orgId: "org",
    by: null,
    from: "agent",
    client: boundary.client,
    patch: {
      cardState: {
        catalog: "In production",
      },
    },
  });
  expect(result.settings.cardState).toEqual({
    ...stored.cardState,
    catalog: "In production",
  });
  expect(result.settings.pipelineStage).toBe("onboarding");
  expect(result.settings.monthlyFee).toBe(2666.67);
  expect(result.changed).toEqual(["cardState"]);
  expect(boundary.written()?.cardState?.managementPayment).toBe("Paid");
});
test("a concurrent settings edit fails rather than silently overwriting it", async () => {
  const boundary = settingsClient(
    {
      cardState: {
        meta: "Live",
      },
    },
    true,
  );
  const error = await setPerformanceSettings({
    brandId: "client",
    orgId: "org",
    by: null,
    from: "agent",
    client: boundary.client,
    patch: {
      cardState: {
        meta: "Paused",
      },
    },
  }).catch((error: unknown) => error);
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toContain("changed while saving");
  expect(boundary.written()).toBeUndefined();
});
