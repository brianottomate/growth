import { expect, test } from "bun:test";
import { setPerformanceSettings } from "./performance-settings.service";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { Database } from "@/server/db";
import type { PerformanceSettings } from "@/server/db/brand-schema";
// The DB boundary returns the actual current settings; assertions protect
// partial operator updates, rather than query implementation details.
function settingsClient(settings: PerformanceSettings) {
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
      set: ({ performanceSettings }: { performanceSettings: SQL }) => ({
        where: () => ({
          returning: async () => {
            const payloads = new PgDialect()
              .sqlToQuery(performanceSettings)
              .params.map(
                (value) =>
                  JSON.parse(String(value)) as Partial<PerformanceSettings>,
              );
            const next: PerformanceSettings = { ...settings, ...payloads[0] };
            if (payloads[1])
              next.cardState = { ...settings.cardState, ...payloads[1] };
            written = next;
            return [
              {
                id: "client",
                performanceSettings: written,
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
