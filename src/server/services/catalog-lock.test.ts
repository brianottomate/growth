import { describe, expect, it } from "bun:test";

import { assertCardOpen, catalogLockBypass } from "./catalog-studio.service";

describe("approved catalog cards", () => {
  it("refuse changes until reopened", () => {
    // The export ships only approved cards, so an approved card changing
    // under the operator would ship something nobody signed off.
    expect(() => assertCardOpen({ approved: true })).toThrow(/Reopen/);
    expect(() => assertCardOpen({ approved: false })).not.toThrow();
    expect(() => assertCardOpen(undefined)).not.toThrow();
  });

  it("only a local dev server may force past the lock", () => {
    expect(process.env.NODE_ENV).not.toBe("development");
    expect(catalogLockBypass(true)).toBe(false);
    expect(() => assertCardOpen({ approved: true }, true)).toThrow(/Reopen/);
  });
});
