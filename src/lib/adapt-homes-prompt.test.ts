import { describe, expect, test } from "bun:test";

import { adaptHomesPrompt } from "./adapt-homes-prompt";

describe("adaptHomesPrompt", () => {
  const base = {
    title: "Follow the fall colors",
    hook: "Take the long way through autumn.",
    sendDate: "2026-10-10T10:00:00.000Z",
  };

  test("carries the issue and asks for a reply the paste reader can take", () => {
    const prompt = adaptHomesPrompt(base);
    expect(prompt).toContain("Issue: Follow the fall colors");
    expect(prompt).toContain("Send date: Saturday, October 10, 2026");
    expect(prompt).toContain("Premise: Take the long way through autumn.");
    expect(prompt).toContain("Links (same order as the homes):");
  });

  test("asks for one shared stay, written into each price line", () => {
    const prompt = adaptHomesPrompt(base);
    expect(prompt).toContain("quote every home for those same dates");
    expect(prompt).toContain("$TOTAL for 3 nights (Month D-D) | Save ~$X");
  });
});
