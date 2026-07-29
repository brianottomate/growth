import { describe, expect, test } from "bun:test";

import {
  groupPlatformThreads,
  platformTextLength,
  threadFormatForPlatform,
} from "./platform-thread";

describe("platform thread grouping", () => {
  test("keeps an ordered reply chain inside one publishing unit", () => {
    const groups = groupPlatformThreads([
      { id: "reply-2", parentPlatformPostId: "root", sequence: 2 },
      { id: "root", parentPlatformPostId: null, sequence: 0 },
      { id: "other", parentPlatformPostId: null, sequence: null },
      { id: "reply-1", parentPlatformPostId: "root", sequence: 1 },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.items.map((item) => item.id)).toEqual([
      "root",
      "reply-1",
      "reply-2",
    ]);
    expect(groups[1]?.items.map((item) => item.id)).toEqual(["other"]);
  });

  test("keeps orphaned replies visible for repair", () => {
    const groups = groupPlatformThreads([
      { id: "orphan", parentPlatformPostId: "missing", sequence: 4 },
    ]);

    expect(groups[0]?.root.id).toBe("orphan");
  });

  test("uses thread formats only while a sequence has multiple posts", () => {
    expect(threadFormatForPlatform("x", 3)).toEqual({
      format: "x.thread",
      archetype: "thread",
    });
    expect(threadFormatForPlatform("threads", 1)).toEqual({
      format: "threads.post",
      archetype: "text",
    });
    expect(threadFormatForPlatform("linkedin", 2)).toEqual({});
  });

  test("uses X's fixed t.co length for URLs", () => {
    const text = `Read more: https://example.com/${"long-slug-".repeat(30)}`;

    expect(platformTextLength(text, "x")).toBe(34);
    expect(platformTextLength(text, "threads")).toBeGreaterThan(300);
  });
});
