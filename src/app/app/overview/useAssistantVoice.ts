"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { openai } from "@ai-sdk/openai";
import { experimental_useRealtime } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import {
  VoiceCaptions,
  spokenResult,
  type VoiceFragment,
} from "@/lib/assistant-voice";
import type { ChatTurnSnapshot, QueuedPayload } from "@/lib/chat-turns";

const model = openai.experimental_realtime("gpt-live-1");
const pause = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
type Run = {
  captions: VoiceCaptions;
  delegations: Set<string>;
  accepting: boolean;
  blocked: boolean;
  queue: Promise<void>;
  context: Record<string, unknown>;
  controller: AbortController;
  threadId: string;
  recoverDraft: (text: string) => void;
};
export function useAssistantVoice({
  threadId,
  scope,
  active,
  context,
  enqueue,
  queueState,
  recoverDraft,
}: {
  threadId: string;
  scope: string;
  active: boolean;
  context: Record<string, unknown>;
  enqueue: (payload: QueuedPayload, steer?: boolean) => Promise<string | false>;
  queueState: ChatTurnSnapshot | null;
  recoverDraft: (text: string) => void;
}) {
  const run = useRef<Run | null>(null);
  const [requested, setRequested] = useState(false);
  const [ending, setEnding] = useState(false);
  const [captions, setCaptions] = useState<VoiceFragment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [steer, setSteer] = useState(false);
  const current = useRef({ enqueue, recoverDraft, steer, queueState });
  current.current = { enqueue, recoverDraft, steer, queueState };
  const delegate = useRef<(id: string, offset?: number) => void>(
    () => undefined,
  );
  const realtime = experimental_useRealtime({
    model,
    api: {
      session: `/api/overview/voice?threadId=${encodeURIComponent(threadId)}`,
    },
    closeTimeoutMs: 15_000,
    maxEvents: 100,
    onEvent(event) {
      const call = run.current;
      if (!call) return;
      if (event.type === "transcript-fragment") {
        call.captions.append({
          speaker: event.speaker,
          delta: event.delta,
          startMs: event.startMs,
          endMs: event.endMs,
        });
        setCaptions(call.captions.preview());
      }
      if (event.type === "delegation-created" && event.target !== "provider")
        delegate.current(event.delegationId, event.offsetMs);
    },
    onError(problem) {
      if (run.current?.accepting) setError(problem.message);
    },
  });
  const sendEvent = realtime.sendEvent;
  useEffect(() => {
    delegate.current = (id, offset) => {
      const call = run.current;
      if (!call?.accepting || call.delegations.has(id)) return;
      call.delegations.add(id);
      const alive = () => call.accepting && run.current === call;
      const commentary = async (content: string) => {
        if (alive())
          await sendEvent({
            type: "context-append",
            delegationId: id,
            content,
            providerOptions: { openai: { channel: "commentary" } },
          });
      };
      // Serialize acceptance; result waits run independently so a correction can
      // reach current work while an earlier request is still running.
      call.queue = call.queue
        .then(async () => {
          await pause(1000);
          if (!alive()) return;
          if (call.blocked) {
            await commentary(
              "A previous request has uncertain delivery. Ask the operator to end voice and review the queue before submitting anything else.",
            );
            return;
          }
          const speech = call.captions.request(offset);
          if (!speech.text) {
            await commentary(
              "No new request transcript is available. Ask the operator to repeat; no new work was submitted.",
            );
            return;
          }
          const payload: QueuedPayload = {
            message: {
              id: crypto.randomUUID(),
              role: "user",
              parts: [{ type: "text", text: speech.text }],
            },
            context: call.context,
          };
          const steering =
            current.current.steer &&
            Boolean(current.current.queueState?.activeTurnId);
          const acceptedId = await current.current.enqueue(payload, steering);
          if (!acceptedId) {
            call.blocked = true;
            setError(
              "Delivery could not be confirmed. End voice and check the queue before submitting the recovered draft.",
            );
            await commentary(
              "Delivery could not be confirmed. Ask the operator to review chat. Do not retry or claim success.",
            );
            return;
          }
          speech.consume();
          setSteer(false);
          setPending((count) => count + 1);
          // The durable input remains after closure. Only this result listener is aborted.
          void (async () => {
            let approvalSent = false;
            while (alive()) {
              const response = await fetch(
                `/api/overview/turns?threadId=${encodeURIComponent(call.threadId)}&inputId=${encodeURIComponent(acceptedId)}`,
                { cache: "no-store", signal: call.controller.signal },
              );
              if (!response.ok)
                throw new Error(
                  "Could not read the saved voice request. Review chat before retrying.",
                );
              const result = (await response.json()) as {
                status: string;
                error: string | null;
                reply: UIMessage | null;
              };
              if (["failed", "cancelled"].includes(result.status)) {
                await commentary(
                  result.error ??
                    "This request was cancelled. Review chat before trying again.",
                );
                return;
              }
              if (result.status === "completed" && result.reply) {
                const awaiting = result.reply.parts.some(
                  (part) =>
                    "state" in part && part.state === "approval-requested",
                );
                if (!awaiting || !approvalSent)
                  await commentary(spokenResult(result.reply));
                if (!awaiting) return;
                approvalSent = true;
              }
              await pause(2000);
            }
          })()
            .catch((problem: unknown) => {
              if (alive())
                setError(
                  problem instanceof Error
                    ? problem.message
                    : "Voice result unavailable. Review chat.",
                );
            })
            .finally(() => {
              if (run.current === call)
                setPending((count) => Math.max(0, count - 1));
            });
        })
        .catch((problem: unknown) => {
          if (alive())
            setError(
              problem instanceof Error
                ? problem.message
                : "Voice delegation failed.",
            );
        });
    };
  }, [sendEvent]);
  const disconnect = realtime.disconnect;
  const close = realtime.close;
  const end = useCallback(async () => {
    const call = run.current;
    if (!call || !call.accepting) return;
    call.accepting = false;
    call.controller.abort();
    setEnding(true);
    try {
      await close();
    } catch {
      if (run.current === call) disconnect();
    }
    await call.queue;
    if (run.current !== call) return;
    setCaptions(call.captions.preview());
    const draft = call.captions.request().text;
    if (draft) call.recoverDraft(draft);
    if (run.current === call) {
      run.current = null;
      setRequested(false);
      setEnding(false);
      setPending(0);
      setSteer(false);
    }
  }, [close, disconnect]);
  useEffect(() => {
    if (!active) void end();
  }, [active, end]);
  useEffect(() => {
    const hide = () => {
      if (document.hidden) void end();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") void end();
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("keydown", escape);
    };
  }, [end]);
  useEffect(() => {
    // Scope changes disconnect while SDK controls are still mounted. The SDK
    // disposes its connection on unmount, before our passive cleanup runs.
    disconnect();
    setRequested(false);
    setEnding(false);
    setPending(0);
    setCaptions([]);
    setSteer(false);
    return () => {
      const call = run.current;
      if (call) {
        call.accepting = false;
        call.controller.abort();
      }
      run.current = null;
    };
  }, [scope, disconnect]);
  useEffect(() => {
    if (
      requested &&
      (realtime.status === "error" || realtime.status === "disconnected")
    )
      void end();
  }, [requested, realtime.status, end]);
  useEffect(() => {
    if (!requested) return;
    const timer = setTimeout(() => void end(), 10 * 60_000);
    return () => clearTimeout(timer);
  }, [requested, end]);
  const start = async () => {
    if (run.current || !active) return;
    setError(null);
    setCaptions([]);
    setRequested(true);
    run.current = {
      captions: new VoiceCaptions(),
      delegations: new Set(),
      accepting: true,
      blocked: false,
      context: { ...context },
      threadId,
      recoverDraft,
      queue: Promise.resolve(),
      controller: new AbortController(),
    };
    try {
      await realtime.connect();
    } catch (problem) {
      setError(
        problem instanceof Error ? problem.message : "Microphone unavailable.",
      );
      await end();
    }
  };
  const toggleMute = async () => {
    try {
      if (realtime.isCapturing) {
        await sendEvent({ type: "input-audio-mute" });
        realtime.stopAudioCapture();
      } else {
        await realtime.resumeAudioCapture();
        await sendEvent({ type: "input-audio-unmute" });
      }
    } catch {
      setError("Could not change the microphone. End voice and reconnect.");
    }
  };
  return {
    start,
    end,
    requested,
    ending,
    status: realtime.status,
    captions,
    error,
    pending,
    steer,
    setSteer,
    toggleMute,
    muted: !realtime.isCapturing,
    resumePlayback: realtime.resumePlayback,
  };
}
