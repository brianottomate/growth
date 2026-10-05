import { expect, test } from "bun:test";
import {
  adHomeContext,
  groupCollectionAds,
  toggleAdSelection,
} from "./ad-collection-groups";
import type { AdContent } from "@/server/db/schema";

const homes = [
  { id: "h1", name: "Pine", externalId: "external1" },
  { id: "h2", name: "Oak", externalId: "external2" },
];
const text = { headlines: [], descriptions: [] };
const ad = (
  id: string,
  content: AdContent = text,
  homeId: string | null = null,
) => ({ id, content, homeId, home: null });
const sourceContent = (ids: string[]) =>
  ({
    media: [],
    headline: "",
    body: "",
    ideaStudio: {
      document: { cards: ids.map((homeId) => ({ source: { homeId } })) },
    },
  }) as unknown as AdContent;

test("home groups partition explicit, source, multi-home and home-less ads exactly once", () => {
  const ads = [
    ad("explicit", sourceContent(["h2"]), "h1"),
    ad("source", sourceContent(["h1", "h1"])),
    ad("multi", sourceContent(["h1", "h2"])),
    ad("brand"),
    ad("legacy", { media: [], headline: "", body: "", propertyName: "Pine" }),
  ];
  const groups = groupCollectionAds(ads, "home", homes);
  expect(
    groups.flatMap((group) => group.ads.map((item) => item.id)).sort(),
  ).toEqual(ads.map((item) => item.id).sort());
  expect(
    groups.find((group) => group.key === "home:h1")?.ads.map((item) => item.id),
  ).toEqual(["explicit", "source"]);
  expect(adHomeContext(ads[2]!, homes).label).toBe("Multiple homes");
  expect(adHomeContext(ads[3]!, homes).label).toBe("Brand-wide · no home");
  expect(adHomeContext(ads[4]!, homes).label).toBe("Pine · name reference");
  expect(
    groupCollectionAds(ads, "type", homes).reduce(
      (count, group) => count + group.ads.length,
      0,
    ),
  ).toBe(ads.length);
  expect(groupCollectionAds([], "home", homes)).toEqual([]);
});

test("group selection survives filtering and regrouping without duplicate IDs", () => {
  let selected = toggleAdSelection(["hidden", "a"], ["a", "b", "b"]);
  expect(selected).toEqual(["hidden", "a", "b"]);
  selected = toggleAdSelection(selected, ["a", "b"]);
  expect(selected).toEqual(["hidden"]);
  expect(toggleAdSelection(selected, ["hidden"])).toEqual([]);
});
