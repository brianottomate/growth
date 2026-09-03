import { describe, expect, it } from "bun:test";

import { vocabularyPrompt } from "./audio-transcription.service";

/**
 * Whisper has never seen "WanderOS" and renders it as the nearest English it
 * knows — a real Booking Burglar take came back as "Wander West". Verified
 * against that clip: without a glossary the model says "Wander West", with one
 * it says "WanderOS". Transcripts are what ad copy is drafted from, so the
 * hint is what keeps a mangled product name out of a live ad.
 */
describe("vocabularyPrompt", () => {
  it("carries the product names Whisper gets wrong", () => {
    expect(vocabularyPrompt()).toContain("WanderOS");
  });

  it("puts the caller's brand first, as the least-known noun", () => {
    const prompt = vocabularyPrompt(["Chalets in Hocking Hills"]);
    expect(prompt.indexOf("Chalets in Hocking Hills")).toBeLessThan(
      prompt.indexOf("WanderOS"),
    );
  });

  it("does not repeat a term the caller also supplied", () => {
    // Entry-level, not substring: "Performance by Wander" legitimately
    // contains "Wander" and is a different term.
    const entries = vocabularyPrompt(["Wander", "  Wander  "])
      .replace(/^Glossary: /, "")
      .replace(/\.$/, "")
      .split(", ");
    expect(entries.filter((entry) => entry === "Wander").length).toBe(1);
    expect(new Set(entries).size).toBe(entries.length);
  });

  it("stays inside the prompt window", () => {
    // Whisper's hint is ~224 tokens; a runaway list would silently truncate
    // and drop the terms that matter.
    const prompt = vocabularyPrompt(
      Array.from({ length: 100 }, (_, i) => `Term${i}`),
    );
    expect(prompt.split(", ").length).toBeLessThanOrEqual(24);
  });

  it("ignores blank input rather than emitting empty entries", () => {
    expect(vocabularyPrompt(["", "   "])).not.toContain(", ,");
  });
});
