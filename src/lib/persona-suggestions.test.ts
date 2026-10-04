import { describe, expect, test } from "bun:test";
import { newPersonaSuggestions } from "./persona-suggestions";

describe("persona starter suggestions", () => {
  test("preserves existing personas across case and spacing variants", () => {
    expect(
      newPersonaSuggestions(
        [{ name: " Family   trips " }, { name: "Friends reconnecting" }],
        ["family trips"],
      ),
    ).toEqual([{ name: "Friends reconnecting" }]);
  });
  test("removes repeated suggestions and blank names", () => {
    expect(
      newPersonaSuggestions(
        [{ name: "Families" }, { name: " families " }, { name: "  " }],
        [],
      ).map((row) => row.name),
    ).toEqual(["Families"]);
  });
  test("keeps a starter set small", () => {
    expect(
      newPersonaSuggestions(
        ["A", "B", "C", "D"].map((name) => ({ name })),
        [],
      ).length,
    ).toBe(3);
  });
});
