"use client";
import { useState } from "react";
import {
  AssistantVoiceControls,
  AssistantVoiceButtons,
} from "@/app/app/overview/AssistantVoiceControls";
import { ChatQueue } from "@/app/app/overview/ChatQueue";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ChatTurnSnapshot } from "@/lib/chat-turns";
import type { useAssistantVoice } from "@/app/app/overview/useAssistantVoice";
import type { useAssistantDictation } from "@/app/app/overview/useAssistantDictation";
export function VoiceWorkbench() {
  const [requested, setRequested] = useState(false);
  const [hasCalled, setHasCalled] = useState(false);
  const [muted, setMuted] = useState(false);
  const [steer, setSteer] = useState(false);
  const [draft, setDraft] = useState("");
  const [dictating, setDictating] = useState(false);
  const [queue, setQueue] = useState<ChatTurnSnapshot>({
    activeTurnId: "sample-turn",
    paused: false,
    stopRequested: false,
    messages: [],
    inputs: [
      {
        id: "sample-queued",
        owned: true,
        status: "queued",
        error: null,
        payload: {
          message: {
            id: "sample-queued",
            role: "user",
            parts: [
              { type: "text", text: "Focus on Instagram for the next week." },
            ],
          },
          context: {},
        },
      },
    ],
  });
  const voice: ReturnType<typeof useAssistantVoice> = {
    requested,
    muted,
    steer,
    setSteer,
    ending: false,
    error: null,
    status: requested ? "connected" : "disconnected",
    pending: requested ? 1 : 0,
    captions: hasCalled
      ? [
          {
            speaker: "user",
            delta: "Plan next week for our brand.",
            startMs: 0,
            endMs: 1500,
          },
          {
            speaker: "assistant",
            delta: "I’m checking the saved content plan.",
            startMs: 1600,
            endMs: 2400,
          },
        ]
      : [],
    start: () => {
      setHasCalled(true);
      setRequested(true);
      return Promise.resolve();
    },
    end: () => {
      setRequested(false);
      return Promise.resolve();
    },
    toggleMute: () => {
      setMuted((value) => !value);
      return Promise.resolve();
    },
    resumePlayback: () => Promise.resolve(),
  };
  const dictation: ReturnType<typeof useAssistantDictation> = {
    capturing: dictating,
    phase: dictating ? "listening" : "idle",
    error: null,
    start: () => {
      setDictating(true);
      setDraft("Plan the next week for Instagram");
      return Promise.resolve();
    },
    done: () => {
      setDictating(false);
      return Promise.resolve();
    },
    cancel: () => {
      setDictating(false);
      setDraft("");
    },
  };
  return (
    <div className="space-y-4 rounded-xl border bg-background p-4">
      <ChatQueue
        state={queue}
        control={(action, id, text) => {
          setQueue((value) => ({
            ...value,
            paused:
              action === "pause"
                ? true
                : action === "resume"
                  ? false
                  : value.paused,
            inputs: value.inputs.flatMap((input) =>
              input.id !== id
                ? [input]
                : action === "cancel"
                  ? []
                  : [
                      {
                        ...input,
                        status: action === "steer" ? "steering" : input.status,
                        payload:
                          action === "edit"
                            ? {
                                ...input.payload,
                                message: {
                                  ...input.payload.message,
                                  parts: [{ type: "text", text: text ?? "" }],
                                },
                              }
                            : input.payload,
                      },
                    ],
            ),
          }));
          return Promise.resolve(true);
        }}
      />
      <AssistantVoiceControls voice={voice} dictation={dictation} busy />
      <Textarea
        aria-label="Editable message draft"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        disabled={dictating}
      />
      <div className="flex items-center justify-end gap-2">
        <AssistantVoiceButtons voice={voice} dictation={dictation} />
        <Button
          disabled={!draft.trim() || dictating}
          onClick={() => setDraft("")}
        >
          Send sample
        </Button>
      </div>
    </div>
  );
}
