import { describe, expect, test } from "bun:test";

import { capabilityWritesWorkspace } from "./assistant-write-effect";

describe("assistant write reconciliation", () => {
  test("keeps direct write capabilities refreshing their surrounding page", () => {
    expect(capabilityWritesWorkspace("contentWrite")).toBe(true);
    expect(capabilityWritesWorkspace("prepareProductionPacket")).toBe(true);
  });

  test("refreshes after a blog sub-agent changes or reconciles an article", () => {
    expect(
      capabilityWritesWorkspace("blogAgent", {
        trail: [
          { tool: "getArticle", summary: "read draft" },
          { tool: "updateFields", summary: "patched image" },
          { tool: "reconcileGrowth", summary: "updated spot" },
        ],
      }),
    ).toBe(true);
  });

  test("does not refresh for read-only blog work or an unattached upload", () => {
    expect(
      capabilityWritesWorkspace("blogAgent", {
        trail: [{ tool: "getArticle", summary: "read draft" }],
      }),
    ).toBe(false);
    expect(
      capabilityWritesWorkspace("blogAgent", {
        trail: [{ tool: "uploadAttachment", summary: "uploaded image" }],
      }),
    ).toBe(false);
  });
});
