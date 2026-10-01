import { describe, expect, it } from "bun:test";

import { planGoogleCompile } from "@/server/services/ads-write.service";
import { parseSearchTerm } from "@/lib/search-terms";
import type { Ad, PlanAudience } from "@/server/db/ads-schema";

const audience = (id: string, keywords: string[] | null): PlanAudience =>
  ({ id, name: id, keywords, excludedKeywords: ["[free]"] }) as PlanAudience;

const textAd = (id: string, headlines: string[], descriptions: string[]): Ad =>
  ({
    id,
    name: id,
    type: "text",
    content: { headlines, descriptions },
  }) as Ad;

const imageAd = (id: string): Ad =>
  ({
    id,
    name: id,
    type: "creative",
    content: {
      headline: "Cabins",
      body: "Book direct",
      media: [{ url: "https://cdn.example.com/a.jpg", type: "image" }],
    },
  }) as Ad;

const rsa = textAd(
  "search",
  ["Hocking Hills cabins", "Hot tubs in the woods", "Book direct"],
  ["Cabins with hot tubs near Old Man's Cave.", "Book direct and save."],
);

describe("parseSearchTerm", () => {
  it("reads match type from the shared notation", () => {
    expect(parseSearchTerm("[Hocking Hills Cabins]")).toEqual({
      text: "hocking hills cabins",
      match: "exact",
    });
    expect(parseSearchTerm('"cabin rental"')?.match).toBe("phrase");
    expect(parseSearchTerm("cabins")?.match).toBe("broad");
  });
});

describe("planGoogleCompile", () => {
  it("makes one search ad group per audience with terms and leaves the rest out", () => {
    const plan = planGoogleCompile({
      campaignType: "search",
      compiled: [
        {
          audience: audience("columbus", ["hocking hills cabins"]),
          spec: undefined,
        },
        { audience: audience("broad", null), spec: undefined },
      ],
      ads: [rsa, imageAd("feed")],
      landingUrl: "https://chaletshh.com",
    });
    expect(plan.groups.map((g) => g.audience?.id)).toEqual(["columbus"]);
    expect(plan.groups[0]!.negatives).toEqual([
      { text: "free", match: "exact" },
    ]);
    expect(plan.units.map((u) => u.ad.id)).toEqual(["search"]);
    expect(plan.warnings.join(" ")).toContain(
      "1 audience(s) have no search terms",
    );
    expect(plan.warnings.join(" ")).toContain("1 creative idea(s)");
  });

  it("falls back to the draft's keywords when no audience has terms", () => {
    const plan = planGoogleCompile({
      campaignType: "search",
      compiled: [],
      ads: [rsa],
      draftKeywords: ["cabins"],
      landingUrl: "https://chaletshh.com",
    });
    expect(plan.groups).toHaveLength(1);
    expect(plan.groups[0]!.keywords[0]!.text).toBe("cabins");
  });

  it("refuses a search ad Google would reject, naming it", () => {
    expect(() =>
      planGoogleCompile({
        campaignType: "search",
        compiled: [{ audience: audience("a", ["cabins"]), spec: undefined }],
        ads: [textAd("short", ["One", "Two"], ["A.", "B."])],
        landingUrl: "https://chaletshh.com",
      }),
    ).toThrow("short: needs 3+ headlines");
  });

  it("sends image ideas to display, one ad group per audience", () => {
    const plan = planGoogleCompile({
      campaignType: "display",
      compiled: [
        { audience: audience("a", null), spec: undefined },
        { audience: audience("b", null), spec: undefined },
      ],
      ads: [imageAd("feed"), rsa],
      landingUrl: "https://chaletshh.com",
    });
    expect(plan.groups).toHaveLength(2);
    expect(plan.units.map((u) => u.ad.id)).toEqual(["feed"]);
  });
});
