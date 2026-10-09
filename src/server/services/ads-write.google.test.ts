import { describe, expect, it } from "bun:test";
import {
  planGoogleCompile,
  type CompiledDeliveryAudience,
} from "@/server/services/ads-write.service";
import type { Ad } from "@/server/db/ads-schema";
const audience = (
  id: string,
  keywords: string[] | null,
): CompiledDeliveryAudience =>
  ({
    id,
    name: id,
    keywords,
    excludedKeywords: ["[free]"],
  }) as CompiledDeliveryAudience;
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
