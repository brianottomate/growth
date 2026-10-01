"use client";
import { useEffect, useRef } from "react";
import { voiceTranscript, type VoiceFragment } from "@/lib/assistant-voice";
import {
  AudioLines,
  Mic,
  MicOff,
  Square,
  Loader2,
  X,
  Check,
  Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { useAssistantVoice } from "./useAssistantVoice";
import type { useAssistantDictation } from "./useAssistantDictation";

function VoiceTranscript({
  captions,
  live = false,
}: {
  captions: VoiceFragment[];
  live?: boolean;
}) {
  const turns = voiceTranscript(captions);
  const scroll = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  useEffect(() => {
    const element = scroll.current;
    if (element && live && following.current)
      element.scrollTop = element.scrollHeight;
  }, [captions, live]);
  return (
    <div
      ref={scroll}
      className="mt-2 max-h-48 space-y-3 overflow-y-auto text-sm"
      aria-label={live ? "Live captions" : "Voice transcript"}
      onScroll={(event) => {
        const element = event.currentTarget;
        following.current =
          element.scrollHeight - element.scrollTop - element.clientHeight < 32;
      }}
    >
      {turns.map((turn, index) => (
        <div key={`${turn.speaker}-${turn.startMs}-${index}`}>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            {turn.speaker === "user" ? "You" : "Growth"}
          </p>
          <p className="break-words whitespace-pre-wrap">{turn.text}</p>
        </div>
      ))}
    </div>
  );
}

export function AssistantVoiceControls({
  voice,
  dictation,
  busy,
}: {
  voice: ReturnType<typeof useAssistantVoice>;
  dictation: ReturnType<typeof useAssistantDictation>;
  busy: boolean;
}) {
  const connected = voice.status === "connected";
  return (
    <div className="mb-2 space-y-2">
      {voice.requested ? (
        <section
          aria-label="Live voice"
          className="rounded-lg border bg-muted/30 p-3"
        >
          <div className="flex items-center gap-2">
            {connected ? (
              <AudioLines className="size-4" />
            ) : (
              <Loader2 className="size-4 animate-spin" />
            )}
            <span role="status" className="flex-1 text-sm font-medium">
              {voice.ending
                ? "Ending voice…"
                : connected
                  ? voice.muted
                    ? "Microphone paused"
                    : "Listening"
                  : voice.status === "error"
                    ? "Voice disconnected"
                    : "Connecting microphone…"}
            </span>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={
                voice.muted ? "Resume microphone" : "Pause microphone"
              }
              disabled={!connected || voice.ending}
              onClick={() => void voice.toggleMute()}
            >
              {voice.muted ? <MicOff /> : <Mic />}
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Enable voice playback"
              disabled={!connected}
              onClick={() => void voice.resumePlayback().catch(() => undefined)}
            >
              <Volume2 />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={voice.ending}
              onClick={() => void voice.end()}
            >
              <Square className="size-3" /> End
            </Button>
          </div>
          {voice.captions.length > 0 && (
            <VoiceTranscript captions={voice.captions} live />
          )}
          {voice.pending > 0 && (
            <p role="status" className="mt-2 text-xs text-muted-foreground">
              {voice.pending} voice{" "}
              {voice.pending === 1 ? "request" : "requests"} waiting for a saved
              result. Accepted work stays in chat when voice ends.
            </p>
          )}
          {busy && (
            <Button
              type="button"
              variant={voice.steer ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={voice.steer}
              onClick={() => voice.setSteer(!voice.steer)}
            >
              Steer current work with next request
            </Button>
          )}
          {voice.steer && (
            <p className="mt-1 text-xs text-muted-foreground">
              Your next spoken request corrects the current turn at its next
              step. Completed actions stay saved.
            </p>
          )}
        </section>
      ) : dictation.capturing ? (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-2">
          {dictation.phase === "listening" ? (
            <Mic className="size-4" />
          ) : (
            <Loader2 className="size-4 animate-spin" />
          )}
          <span role="status" className="flex-1 text-sm">
            {dictation.phase === "listening"
              ? "Dictating into your draft"
              : dictation.phase === "finishing"
                ? "Finishing your words…"
                : "Connecting microphone…"}
          </span>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Cancel dictation"
            onClick={dictation.cancel}
          >
            <X />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={dictation.phase !== "listening"}
            onClick={() => void dictation.done()}
          >
            <Check /> Done
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void dictation.start()}
          >
            <Mic /> Dictate
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void voice.start()}
          >
            <AudioLines /> Talk with Growth
          </Button>
          <span className="text-xs text-muted-foreground">
            Dictate a draft or start a conversation
          </span>
        </div>
      )}
      {!voice.requested && voice.captions.length > 0 && (
        <details className="rounded-lg border bg-muted/30 p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Voice transcript
          </summary>
          <p className="mt-1 text-xs text-muted-foreground">
            Captions from this call stay available until you start another call
            or leave this context.
          </p>
          <VoiceTranscript captions={voice.captions} />
        </details>
      )}
      {(voice.error || dictation.error) && (
        <p role="alert" className="text-xs text-muted-foreground">
          {voice.error || dictation.error}
        </p>
      )}
    </div>
  );
}
