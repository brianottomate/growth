import { describe, expect, test } from "bun:test";
import { GROWTH_CAPABILITY_ACTIONS } from "@/lib/growth-capabilities";
import { specimens } from "./fixtures";

describe("assistant gallery contract", () => {
  test("every result previews an advertised Growth action", () => {
    for (const specimen of specimens) {
      const actions: readonly string[] =
        GROWTH_CAPABILITY_ACTIONS[specimen.capability];
      expect(actions, specimen.id).toContain(specimen.action);
    }
  });
});
