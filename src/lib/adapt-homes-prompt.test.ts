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
    expect(prompt).toContain("Stays: YYYY-MM-DD to YYYY-MM-DD");
    expect(prompt).toContain("Links (same order as the homes):");
  });

  test("pins the stay when the issue has one, else asks for one", () => {
    expect(
      adaptHomesPrompt({
        ...base,
        stayWindow: { checkIn: "2026-10-16", checkOut: "2026-10-19" },
      }),
    ).toContain(
      "Stay: Friday, October 16, 2026 to Monday, October 19, 2026. Quote every home for exactly these dates.",
    );
    expect(adaptHomesPrompt(base)).toContain("Propose one three-night stay");
  });
});
