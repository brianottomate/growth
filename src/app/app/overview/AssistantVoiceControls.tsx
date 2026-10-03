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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

type VoiceControlsProps = {
  voice: ReturnType<typeof useAssistantVoice>;
  dictation: ReturnType<typeof useAssistantDictation>;
};

/** Start controls live with Send; active sessions keep their status above the draft. */
export function AssistantVoiceButtons({
  voice,
  dictation,
}: VoiceControlsProps) {
  if (voice.requested || dictation.capturing) return null;
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            tone="muted"
            size="icon"
            className="size-11 lg:size-9"
            aria-label="Dictate"
            onClick={() => void dictation.start()}
          >
            <Mic className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Dictate</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            tone="muted"
            size="icon"
            className="size-11 lg:size-9"
            aria-label="Talk with Growth"
            onClick={() => void voice.start()}
          >
            <AudioLines className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Talk with Growth</TooltipContent>
      </Tooltip>
    </>
  );
}

export function AssistantVoiceControls({
  voice,
  dictation,
  busy,
}: VoiceControlsProps & { busy: boolean }) {
  if (
    !voice.requested &&
    !dictation.capturing &&
    !voice.captions.length &&
    !voice.error &&
    !dictation.error
  )
    return null;
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
      ) : null}
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
