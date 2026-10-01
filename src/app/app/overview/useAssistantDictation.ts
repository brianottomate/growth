"use client";
import { z } from "zod";
import { useCallback, useEffect, useRef, useState } from "react";
const transcriptEvent = z.object({
  type: z.string().optional(),
  item_id: z.string().optional(),
  previous_item_id: z.string().nullable().optional(),
  delta: z.string().optional(),
  transcript: z.string().optional(),
});
type Capture = {
  peer: RTCPeerConnection;
  channel: RTCDataChannel;
  stream: MediaStream | null;
  controller: AbortController;
  text: Map<string, string>;
  order: string[];
  base: string;
  finish: (() => void) | null;
  timer?: ReturnType<typeof setTimeout>;
};
export function useAssistantDictation({
  value,
  onChange,
  active,
  scope,
}: {
  value: string;
  onChange: (text: string) => void;
  active: boolean;
  scope: string;
}) {
  const [phase, setPhase] = useState<
    "idle" | "connecting" | "listening" | "finishing"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const capture = useRef<Capture | null>(null);
  const change = useRef(onChange);
  change.current = onChange;
  const release = useCallback(() => {
    const call = capture.current;
    capture.current = null;
    if (!call) return;
    clearTimeout(call.timer);
    call.controller.abort();
    call.stream?.getTracks().forEach((track) => track.stop());
    call.channel.close();
    call.peer.close();
    call.finish?.();
  }, []);
  const stop = useCallback(
    (cancel = false) => {
      const call = capture.current;
      if (cancel && call) change.current(call.base);
      release();
      setPhase("idle");
    },
    [release],
  );
  const done = useCallback(async () => {
    const call = capture.current;
    if (!call) return;
    if (call.channel.readyState !== "open") {
      stop();
      return;
    }
    setPhase("finishing");
    call.stream?.getTracks().forEach((track) => (track.enabled = false));
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        setError(
          "Final words could not be confirmed. Review the draft before sending.",
        );
        resolve();
      }, 5000);
      call.finish = () => {
        clearTimeout(timer);
        resolve();
      };
      try {
        call.channel.send(
          JSON.stringify({ type: "input_audio_buffer.commit" }),
        );
      } catch {
        call.finish();
      }
    });
    if (capture.current === call) stop();
  }, [stop]);
  const start = async () => {
    if (capture.current || !active) return;
    setError(null);
    setPhase("connecting");
    let attempt: Capture | null = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext)
        throw new Error("Microphone requires a secure browser connection.");
      const peer = new RTCPeerConnection();
      const channel = peer.createDataChannel("dictation");
      const call: Capture = {
        peer,
        channel,
        stream: null,
        controller: new AbortController(),
        text: new Map(),
        order: [],
        base: value,
        finish: null,
      };
      capture.current = call;
      attempt = call;
      const fail = (message: string) => {
        if (capture.current !== call) return;
        setError(message);
        stop();
      };
      channel.onopen = () => {
        if (capture.current === call) setPhase("listening");
      };
      channel.onclose = () => {
        if (capture.current === call)
          fail("Dictation disconnected. Your draft is preserved.");
      };
      channel.onerror = () =>
        fail("Dictation disconnected. Your draft is preserved.");
      channel.onmessage = (event) => {
        if (capture.current !== call) return;
        let raw: unknown;
        try {
          raw = JSON.parse(String(event.data)) as unknown;
        } catch {
          return;
        }
        const parsed = transcriptEvent.safeParse(raw);
        if (!parsed.success) return;
        const data = parsed.data;
        if (
          data.type === "error" ||
          data.type === "conversation.item.input_audio_transcription.failed"
        ) {
          fail("Transcription failed. Your draft is preserved.");
          return;
        }
        if (!data.item_id) return;
        if (data.type === "input_audio_buffer.committed") {
          if (!call.order.includes(data.item_id)) call.order.push(data.item_id);
          return;
        }
        if (
          !data.type?.startsWith("conversation.item.input_audio_transcription.")
        )
          return;
        if (!call.order.includes(data.item_id)) call.order.push(data.item_id);
        if (data.type.endsWith(".delta"))
          call.text.set(
            data.item_id,
            (call.text.get(data.item_id) ?? "") + (data.delta ?? ""),
          );
        if (data.type.endsWith(".completed")) {
          call.text.set(data.item_id, data.transcript ?? "");
          call.finish?.();
        }
        const words = call.order
          .map((id) => call.text.get(id) ?? "")
          .join(" ")
          .trim();
        change.current([call.base, words].filter(Boolean).join(" "));
      };
      peer.onconnectionstatechange = () => {
        if (["failed", "disconnected"].includes(peer.connectionState))
          fail("Dictation disconnected. Your draft is preserved.");
      };
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (capture.current !== call) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      call.stream = stream;
      for (const track of stream.getAudioTracks()) peer.addTrack(track, stream);
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const response = await fetch("/api/overview/dictation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sdp: offer.sdp }),
        signal: AbortSignal.any([
          call.controller.signal,
          AbortSignal.timeout(30_000),
        ]),
      });
      const answer = (await response.json()) as {
        sdp?: string;
        error?: string;
      };
      if (!response.ok || !answer.sdp)
        throw new Error(answer.error ?? "Dictation could not connect.");
      if (capture.current !== call) return;
      await peer.setRemoteDescription({ type: "answer", sdp: answer.sdp });
      call.timer = setTimeout(() => void done(), 120_000);
    } catch (problem) {
      if (attempt && capture.current !== attempt) return;
      setError(
        problem instanceof Error ? problem.message : "Microphone unavailable.",
      );
      stop();
    }
  };
  useEffect(() => {
    if (!active) stop();
  }, [active, stop]);
  useEffect(() => {
    const hide = () => {
      if (document.hidden) stop();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") stop(true);
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("keydown", escape);
    };
  }, [stop]);
  useEffect(() => {
    setPhase("idle");
    return () => release();
  }, [scope, release]);
  return {
    start,
    done,
    cancel: () => stop(true),
    phase,
    error,
    capturing: phase !== "idle",
  };
}
