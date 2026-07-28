import { describe, expect, test } from "bun:test";

import { getSafeWorkspacePath, WORKSPACE_ROUTES } from "./workspace-navigation";

describe("workspace navigation", () => {
  test("keeps named destinations on real app routes", () => {
    expect(WORKSPACE_ROUTES.product_atlas).toBe("/app/product-atlas");
    expect(WORKSPACE_ROUTES.leads).toBe("/app/leads");
    expect(WORKSPACE_ROUTES.spend).toBe("/app/spend");
  });

  test("allows safe app paths as a forward-compatible fallback", () => {
    expect(getSafeWorkspacePath("/app/series/series_123?view=grid")).toBe(
      "/app/series/series_123?view=grid",
    );
  });

  test("rejects external and non-workspace paths", () => {
    expect(getSafeWorkspacePath("https://example.com/app")).toBeNull();
    expect(getSafeWorkspacePath("/signin")).toBeNull();
    expect(getSafeWorkspacePath("/application")).toBeNull();
  });
});
