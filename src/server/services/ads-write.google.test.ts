import { describe, expect, it } from "bun:test";
import { planGoogleCompile } from "@/server/services/ads-write.service";
import type { Ad, PlanAudience } from "@/server/db/ads-schema";
const audience = (id: string, keywords: string[] | null): PlanAudience =>
  ({
    id,
    name: id,
    keywords,
    excludedKeywords: ["[free]"],
  }) as PlanAudience;
const textAd = (id: string, headlines: string[], descriptions: string[]): Ad =>
  ({
    id,
    name: id,
    type: "text",
    content: {
      headlines,
      descriptions,
    },
  }) as Ad;
describe("planGoogleCompile", () => {
  it("refuses a search ad Google would reject, naming it", () => {
    expect(() =>
      planGoogleCompile({
        campaignType: "search",
        compiled: [
          {
            audience: audience("a", ["cabins"]),
            spec: undefined,
          },
        ],
        ads: [textAd("short", ["One", "Two"], ["A.", "B."])],
        landingUrl: "https://chaletshh.com",
      }),
    ).toThrow("short: needs 3+ headlines");
  });
});
