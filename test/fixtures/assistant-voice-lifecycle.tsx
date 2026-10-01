import { mock } from "bun:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { act, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Experimental_UseRealtimeOptions } from "@ai-sdk/react";
import type { useAssistantVoice as VoiceHook } from "../../src/app/app/overview/useAssistantVoice";

// Isolate browser globals and provider simulation from the main test process.
const window = new Window();
Object.assign(globalThis, {
  window,
  document: window.document,
  navigator: window.navigator,
  IS_REACT_ACT_ENVIRONMENT: true,
});
const scenario = process.argv[2];
let provider: Experimental_UseRealtimeOptions | undefined;
let closeProvider: (() => void) | undefined;
let pendingSignal: AbortSignal | undefined;
if (scenario !== "unmount") {
  void mock.module("@ai-sdk/react", () => ({
    experimental_useRealtime: function useSimulatedRealtime(
      options: Experimental_UseRealtimeOptions,
    ) {
      provider = options;
      const [status, setStatus] = useState("disconnected");
      const controls = useMemo(
        () => ({
          connect: async () => setStatus("connected"),
          close: async () => {
            if (scenario === "final-captions") {
              await new Promise((resolve) => setTimeout(resolve, 20));
              provider?.onEvent?.({
                type: "transcript-fragment",
                speaker: "user",
                delta: "gram next week. [laugh",
                startMs: 100,
                endMs: 200,
                raw: {},
              });
            }
            setStatus("disconnected");
          },
          disconnect: () => setStatus("disconnected"),
          sendEvent: async () => undefined,
        }),
        [],
      );
      closeProvider = controls.disconnect;
      return {
        status,
        isCapturing: status === "connected",
        ...controls,
      };
    },
  }));
  globalThis.fetch = ((_url: string | URL | Request, options?: RequestInit) => {
    pendingSignal = options?.signal ?? undefined;
    return new Promise<Response>((_resolve, reject) => {
      pendingSignal?.addEventListener(
        "abort",
        () => reject(new Error("aborted")),
        { once: true },
      );
    });
  }) as typeof fetch;
}
const { useAssistantVoice } =
  await import("../../src/app/app/overview/useAssistantVoice");
let voice: ReturnType<typeof VoiceHook> | undefined;
const drafts: string[] = [];
const accepted: string[] = [];
function Probe({ scope = "thread-one" }: { scope?: string }) {
  voice = useAssistantVoice({
    threadId: scope,
    scope,
    active: true,
    context: {},
    enqueue: async (payload) => {
      accepted.push(payload.message.id);
      return payload.message.id;
    },
    queueState: null,
    recoverDraft: (text) => drafts.push(text),
  });
  return null;
}
const root = createRoot(document.createElement("div"));
await act(async () => root.render(<Probe />));
if (scenario === "unmount") {
  // Exercise the real installed SDK, including its insertion-effect teardown.
  await act(async () =>
    root.render(<Probe key="thread-two" scope="thread-two" />),
  );
  await act(async () => root.unmount());
} else if (scenario === "final-captions") {
  assert.ok(voice);
  await act(async () => voice!.start());
  await act(async () =>
    provider?.onEvent?.({
      type: "transcript-fragment",
      speaker: "user",
      delta: "[lip smack ]Plan Insta",
      startMs: 0,
      endMs: 100,
      raw: {},
    }),
  );
  await act(async () => voice!.end());
  assert.deepEqual(drafts, ["Plan Instagram next week."]);
  assert.equal(
    voice.captions.length,
    2,
    "final events remain available after ending the call",
  );
  assert.equal(voice.requested, false);
  await act(async () => root.unmount());
} else {
  assert.ok(voice);
  await act(async () => voice!.start());
  assert.equal(voice.requested, true);
  await act(async () => {
    provider?.onEvent?.({
      type: "transcript-fragment",
      speaker: "user",
      delta: "Plan next week",
      startMs: 0,
      endMs: 100,
      raw: {},
    });
    provider?.onEvent?.({
      type: "delegation-created",
      delegationId: "request-one",
      target: "client",
      offsetMs: 100,
      raw: {},
    });
    await new Promise((resolve) => setTimeout(resolve, 1100));
  });
  assert.equal(accepted.length, 1);
  assert.ok(pendingSignal);
  assert.equal(voice.pending, 1);
  await act(async () => {
    provider?.onEvent?.({
      type: "transcript-fragment",
      speaker: "user",
      delta: "Use Instagram",
      startMs: 200,
      endMs: 300,
      raw: {},
    });
    closeProvider?.();
  });
  assert.equal(voice.requested, false);
  assert.equal(voice.pending, 0);
  assert.equal(pendingSignal.aborted, true);
  assert.deepEqual(drafts, ["Use Instagram"]);
  // Restart is available immediately; accepted work is not replayed.
  await act(async () => voice!.start());
  assert.equal(voice.requested, true);
  assert.equal(voice.status, "connected");
  assert.equal(accepted.length, 1);
  // Changing page context still ends capture while the hook remains mounted.
  await act(async () => root.render(<Probe scope="different-page" />));
  assert.equal(voice.requested, false);
  assert.equal(voice.status, "disconnected");
  await act(async () => voice!.end());
  await act(async () => root.unmount());
}
console.log("voice lifecycle checks passed");
