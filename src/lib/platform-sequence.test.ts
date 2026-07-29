import { describe, expect, test } from "bun:test";

import {
  isStoryFormat,
  sequenceNoun,
  sequenceScheduledAt,
} from "./platform-sequence";
import { getPlatformFormat } from "@/server/content/formats";

describe("platform publishing sequences", () => {
  test("recognizes the Story formats the connected publishing surfaces support", () => {
    expect(isStoryFormat("instagram.story")).toBe(true);
    expect(isStoryFormat("facebook.story")).toBe(true);
    expect(isStoryFormat("instagram.carousel")).toBe(false);
  });

  test("models each provider Story as one media frame inside an ordered unit", () => {
    for (const id of ["instagram.story", "facebook.story"]) {
      const format = getPlatformFormat(id);
      expect(format?.archetype).toBe("story");
      expect(format?.sequence).toBe(true);
      expect(format?.media.min).toBe(1);
      expect(format?.media.max).toBe(1);
    }
  });

  test("gives ordered provider jobs deterministic one-minute offsets", () => {
    const root = new Date("2026-08-05T12:00:00.000Z");
    expect(sequenceScheduledAt(root, 0).toISOString()).toBe(
      "2026-08-05T12:00:00.000Z",
    );
    expect(sequenceScheduledAt(root, 2).toISOString()).toBe(
      "2026-08-05T12:02:00.000Z",
    );
  });

  test("uses Story language without changing thread language", () => {
    expect(sequenceNoun("instagram.story", 3)).toBe("frames");
    expect(sequenceNoun("x.thread", 3)).toBe("posts");
  });
});
