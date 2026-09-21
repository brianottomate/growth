import { expect, test } from "bun:test";
import { groupMediaExports } from "./media-export-bundles";

const exported = (id: string, sourceVersion = "v1", adId = "ad1") => ({
  id,
  metadata: {
    adApproval: { adId, sourceVersion, shape: "portrait", cardId: id },
  },
});

test("an approval occupies one library entry while source photos remain separate", () => {
  const source = { id: "source", metadata: {} };
  const entries = groupMediaExports([
    exported("slide1"),
    source,
    exported("slide2"),
  ]);
  expect(entries.map((entry) => entry.assets.map((asset) => asset.id))).toEqual(
    [["slide1", "slide2"], ["source"]],
  );
  expect(entries[1]!.approval).toBeNull();
});

test("different ads and approval revisions never share a bundle", () => {
  expect(
    groupMediaExports([
      exported("one"),
      exported("two", "v2"),
      exported("three", "v1", "ad2"),
    ]),
  ).toHaveLength(3);
});

test("filtered results contain only matching exports and malformed metadata stays accessible", () => {
  const partial = { id: "partial", metadata: { adApproval: { adId: "ad1" } } };
  const entries = groupMediaExports([exported("matching"), partial]);
  expect(entries[0]!.assets.map((asset) => asset.id)).toEqual(["matching"]);
  expect(entries[1]!.approval).toBeNull();
});
