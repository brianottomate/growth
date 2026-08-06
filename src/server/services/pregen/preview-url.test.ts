import { describe, expect, it } from "bun:test";

import { previewHostLabel } from "./preview-url";

// The label is an integration contract with the renderer: it must survive
// being a DNS label, and the renderer only accepts hosts exactly one label
// deep below the zone. A domain that produces `a.b` or an empty string would
// silently 404 the prospect's own preview link.
describe("previewHostLabel", () => {
  it("takes the registrable name and drops the rest", () => {
    expect(previewHostLabel("cascadiagetaways.com")).toBe("cascadiagetaways");
    expect(previewHostLabel("www.Cascadia-Getaways.co.uk")).toBe(
      "cascadia-getaways",
    );
    expect(previewHostLabel("https://stay.example.com/homes")).toBe("stay");
  });

  it("never emits something that is not a legal single label", () => {
    expect(previewHostLabel("under_score.com")).toBe("under-score");
    expect(previewHostLabel("-leading-and-trailing-.com")).toBe(
      "leading-and-trailing",
    );
    expect(previewHostLabel(`${"a".repeat(80)}.com`).length).toBe(63);
  });

  it("falls back rather than producing an empty host", () => {
    expect(previewHostLabel("")).toBe("preview");
    expect(previewHostLabel("...")).toBe("preview");
  });
});
