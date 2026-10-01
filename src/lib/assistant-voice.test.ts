import { describe, expect, test } from "bun:test";
import type { UIMessage } from "ai";
import {
  VoiceCaptions,
  spokenResult,
  voiceTranscript,
} from "./assistant-voice";

describe("readable voice transcripts", () => {
  test("a long call keeps its beginning and final words", () => {
    const captions = new VoiceCaptions();
    for (let i = 0; i < 100; i++)
      captions.append({
        speaker: "user",
        delta: `${i} `,
        startMs: i * 10,
        endMs: (i + 1) * 10,
      });
    const transcript = voiceTranscript(captions.preview());
    expect(transcript[0]?.text).toBe(
      Array.from({ length: 100 }, (_, i) => i).join(" "),
    );
  });
  test("token boundaries preserve words while speech cues and speaker changes render cleanly", () => {
    const transcript = voiceTranscript([
      { speaker: "user", delta: "[lip ", startMs: 0, endMs: 10 },
      { speaker: "user", delta: "smack ]Plan Insta", startMs: 10, endMs: 20 },
      { speaker: "user", delta: "gram. [laugh", startMs: 20, endMs: 30 },
      { speaker: "assistant", delta: "I can help.", startMs: 40, endMs: 50 },
      { speaker: "user", delta: "Next week.", startMs: 2000, endMs: 2010 },
    ]);
    expect(transcript.map(({ speaker, text }) => ({ speaker, text }))).toEqual([
      { speaker: "user", text: "Plan Instagram." },
      { speaker: "assistant", text: "I can help." },
      { speaker: "user", text: "Next week." },
    ]);
  });
});

describe("spoken workspace requests", () => {
  test("late and duplicate captions stay ordered without submitting a request twice", () => {
    const captions = new VoiceCaptions();
    const beginning = {
      speaker: "user" as const,
      delta: "Plan ",
      startMs: 100,
      endMs: 200,
    };
    captions.append({
      speaker: "user",
      delta: "next week",
      startMs: 200,
      endMs: 400,
    });
    captions.append(beginning);
    captions.append(beginning);
    captions.append({
      speaker: "assistant",
      delta: "Checking",
      startMs: 450,
      endMs: 600,
    });
    captions.append({
      speaker: "user",
      delta: "Use Instagram",
      startMs: 900,
      endMs: 1100,
    });
    const first = captions.request(500);
    expect(first.text).toBe("Plan next week");
    first.consume();
    captions.append({ speaker: "user", delta: ".", startMs: 400, endMs: 450 });
    expect(captions.request(500).text).toBe("");
    expect(captions.request(1200).text).toBe("Use Instagram");
    expect(captions.preview().some((fragment) => fragment.delta === ".")).toBe(
      true,
    );
  });
  test("a rejected request remains recoverable as an editable draft", () => {
    const captions = new VoiceCaptions();
    captions.append({
      speaker: "user",
      delta: "Change the audience",
      startMs: 0,
      endMs: 400,
    });
    expect(captions.request().text).toBe("Change the audience");
    expect(captions.request().text).toBe("Change the audience");
  });
});
describe("verified spoken results", () => {
  test("a pending approval cannot be spoken as a completed campaign change", () => {
    const message: UIMessage = {
      id: "reply",
      role: "assistant",
      parts: [
        { type: "text", text: "The campaign is ready." },
        {
          type: "tool-adsWrite",
          toolCallId: "call",
          state: "approval-requested",
          input: {},
          approval: { id: "approval" },
        },
      ],
    };
    expect(spokenResult(message)).toContain("click the approval card");
    expect(spokenResult(message)).toContain("not been approved or completed");
    expect(spokenResult(message)).not.toContain("campaign is ready");
  });
  test("tool JSON and model reasoning never become spoken commentary", () => {
    const message: UIMessage = {
      id: "reply",
      role: "assistant",
      parts: [
        { type: "reasoning", text: "private reasoning" },
        {
          type: "tool-brandRead",
          toolCallId: "call",
          state: "output-available",
          input: {},
          output: { ok: true, secret: "opaque receipt" },
        },
        { type: "text", text: "There are two drafts to review." },
      ],
    };
    expect(spokenResult(message)).toBe("There are two drafts to review.");
  });
  test("an interrupted approval continuation cannot be spoken as a completed action", () => {
    const message: UIMessage = {
      id: "reply",
      role: "assistant",
      metadata: { queueTurnError: "Interrupted" },
      parts: [{ type: "text", text: "Done." }],
    };
    expect(spokenResult(message)).toContain("stopped before completing");
    expect(spokenResult(message)).not.toContain("Done.");
  });
  test("a failed tool prevents unqualified success wording", () => {
    const message: UIMessage = {
      id: "reply",
      role: "assistant",
      parts: [
        {
          type: "tool-brandWrite",
          toolCallId: "call",
          state: "output-available",
          input: {},
          output: { ok: false },
        },
      ],
    };
    expect(spokenResult(message)).toContain("Some work failed");
  });
});
