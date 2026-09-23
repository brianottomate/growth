"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { UIMessage } from "ai";
import {
  hasPendingApproval,
  type ChatTurnSnapshot,
  type QueuedPayload,
} from "@/lib/chat-turns";
import { toast } from "@/components/ui/toast";

type Send = (
  message: QueuedPayload["message"],
  options: { body: Record<string, unknown> },
) => Promise<void>;
export function useChatQueue({
  threadId,
  status,
  send,
  setMessages,
  clearError,
  active,
}: {
  threadId: string;
  status: string;
  send: Send;
  setMessages: (messages: UIMessage[]) => void;
  clearError: () => void;
  active: boolean;
}) {
  const [state, setState] = useState<ChatTurnSnapshot | null>(null);
  const [saving, setSaving] = useState(false);
  // The input this client just sent. Until a poll sees the server claim it,
  // the snapshot still says "queued", and the pending panel would show the
  // message twice: running in the transcript and queued below it.
  const [inFlightId, setInFlightId] = useState<string | null>(null);
  const dispatching = useRef(false);
  const accepting = useRef(false);
  const unacknowledged = useRef<{ key: string; id: string } | null>(null);
  const requestSequence = useRef(0);
  const pollState = useRef<ChatTurnSnapshot | null>(null);
  const current = useRef({ status, threadId, setMessages });
  current.current = { status, threadId, setMessages };
  const refresh = useCallback(async () => {
    const sequence = ++requestSequence.current;
    const response = await fetch(
      `/api/overview/turns?threadId=${encodeURIComponent(threadId)}`,
      { cache: "no-store" },
    );
    if (!response.ok) throw new Error("Could not refresh this session");
    const snapshot = (await response.json()) as ChatTurnSnapshot;
    if (
      current.current.threadId !== threadId ||
      sequence !== requestSequence.current
    )
      return;
    pollState.current = snapshot;
    setState(snapshot);
    if (
      current.current.status === "error" &&
      !snapshot.paused &&
      !snapshot.inputs.some((input) => input.status === "failed")
    )
      clearError();
    if (
      !dispatching.current &&
      !["submitted", "streaming"].includes(current.current.status)
    )
      current.current.setMessages(snapshot.messages);
  }, [threadId, clearError]);
  const command = useCallback(
    async (body: Record<string, unknown>) => {
      const response = await fetch("/api/overview/turns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, threadId }),
      });
      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        throw new Error(result.error ?? "Could not update this session");
      }
      await refresh().catch(() => undefined);
    },
    [threadId, refresh],
  );
  useEffect(() => {
    if (!active) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        await refresh();
      } catch {
        /* Keep accepted input visible until connectivity returns. */
      }
      if (!disposed)
        timer = setTimeout(
          () => void poll(),
          document.hidden
            ? 60_000
            : pollState.current?.activeTurnId ||
                pollState.current?.inputs.length
              ? 2000
              : 30_000,
        );
    };
    const onFocus = () => {
      void refresh().catch(() => undefined);
    };
    window.addEventListener("focus", onFocus);
    void poll();
    return () => {
      window.removeEventListener("focus", onFocus);
      disposed = true;
      clearTimeout(timer);
    };
  }, [active, refresh]);
  useEffect(() => {
    if (
      !active ||
      !state ||
      state.activeTurnId ||
      state.paused ||
      dispatching.current ||
      status !== "ready" ||
      hasPendingApproval(state.messages)
    )
      return;
    const next = state.inputs.find((input) => input.status === "queued");
    if (!next || !next.owned) return;
    dispatching.current = true;
    setInFlightId(next.id);
    setMessages(state.messages);
    void send(next.payload.message, {
      body: { ...next.payload.context, inputId: next.id, threadId },
    })
      .catch(() => undefined)
      .finally(() => {
        dispatching.current = false;
        setInFlightId(null);
        void refresh().catch(() => undefined);
      });
  }, [active, state, status, send, setMessages, threadId, refresh]);
  const enqueue = useCallback(
    async (payload: QueuedPayload, steer = false) => {
      if (accepting.current) return false;
      if (steer && !state?.activeTurnId) {
        toast.error(
          "Wait for the current response to start before steering it.",
        );
        return false;
      }
      accepting.current = true;
      setSaving(true);
      try {
        const key = JSON.stringify({
          threadId,
          parts: payload.message.parts,
          context: payload.context,
          steer,
        });
        const id =
          unacknowledged.current?.key === key
            ? unacknowledged.current.id
            : payload.message.id;
        unacknowledged.current = { key, id };
        await command({
          action: "enqueue",
          payload: { ...payload, message: { ...payload.message, id } },
          ...(steer && state?.activeTurnId
            ? { targetTurnId: state.activeTurnId }
            : {}),
        });
        unacknowledged.current = null;
        return true;
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Your message could not be queued",
        );
        return false;
      } finally {
        accepting.current = false;
        setSaving(false);
      }
    },
    [command, state?.activeTurnId, threadId],
  );
  const control = useCallback(
    async (action: string, id?: string, text?: string) => {
      try {
        await command({ action, id, text });
        if (action === "resume" || action === "retry") clearError();
        return true;
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Queue update failed",
        );
        return false;
      }
    },
    [command, clearError],
  );
  const shown =
    state && inFlightId
      ? {
          ...state,
          inputs: state.inputs.map((input) =>
            input.id === inFlightId && input.status === "queued"
              ? { ...input, status: "running" as const }
              : input,
          ),
        }
      : state;
  return { state: shown, saving, enqueue, control, refresh };
}
