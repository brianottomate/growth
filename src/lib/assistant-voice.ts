import { isToolUIPart, type UIMessage } from "ai";

export function voiceText(message: UIMessage) {
  return message.parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n");
}
export function spokenResult(message: UIMessage) {
  if (
    (message.metadata as { queueTurnError?: string } | undefined)
      ?.queueTurnError
  )
    return "The assistant stopped before completing this request. Ask the operator to review saved actions in chat before retrying.";
  if (
    message.parts.some(
      (part) => isToolUIPart(part) && part.state === "approval-requested",
    )
  )
    return "This request needs approval. Ask the operator to review and click the approval card in chat. It has not been approved or completed.";
  if (
    message.parts.some(
      (part) =>
        isToolUIPart(part) &&
        (part.state === "output-error" ||
          (part.state === "output-available" &&
            typeof part.output === "object" &&
            part.output !== null &&
            "ok" in part.output &&
            part.output.ok === false)),
    )
  )
    return `Some work failed. Explain that the operator should review the written details before retrying. ${voiceText(message).slice(0, 6000)}`;
  return (
    voiceText(message).slice(0, 8000) ||
    "The assistant saved its result in chat. Ask the operator to review the cards there; no spoken summary is available."
  );
}
export type VoiceFragment = {
  speaker: "user" | "assistant";
  delta: string;
  startMs: number;
  endMs: number;
};
export function readableSpeech(text: string) {
  return text
    .replace(
      /\[(?:lip smack|laugh|chuckle|cough|sigh|breath|throat clear)[^\]]*(?:\]|$)/gi,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}
/** Join token deltas before formatting so split words and speech cues stay intact. */
export function voiceTranscript(fragments: VoiceFragment[]) {
  const turns: Array<VoiceFragment & { text: string }> = [];
  for (const fragment of fragments) {
    const previous = turns.at(-1);
    if (
      previous?.speaker === fragment.speaker &&
      fragment.startMs - previous.endMs < 1000
    ) {
      previous.delta += fragment.delta;
      previous.endMs = Math.max(previous.endMs, fragment.endMs);
    } else turns.push({ ...fragment, text: "" });
  }
  return turns
    .map((turn) => ({ ...turn, text: readableSpeech(turn.delta) }))
    .filter((turn) => turn.text);
}
/** Keep provider timestamps and consume user speech only through a delegation's boundary. */
export class VoiceCaptions {
  private fragments: VoiceFragment[] = [];
  private seen = new Set<string>();
  private consumed = new Set<string>();
  private delegatedThrough = -Infinity;
  private key(fragment: VoiceFragment) {
    return JSON.stringify(fragment);
  }
  append(fragment: VoiceFragment) {
    const key = this.key(fragment);
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.fragments.push(fragment);
    this.fragments.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  }
  preview() {
    return this.fragments.slice();
  }
  request(offset = Infinity) {
    const batch = this.fragments.filter(
      (fragment) =>
        fragment.speaker === "user" &&
        fragment.startMs <= offset &&
        fragment.endMs > this.delegatedThrough &&
        !this.consumed.has(this.key(fragment)),
    );
    return {
      text: voiceTranscript(batch)
        .map((turn) => turn.text)
        .join("\n"),
      consume: () => {
        if (batch.length)
          this.delegatedThrough = Math.max(
            this.delegatedThrough,
            Number.isFinite(offset)
              ? offset
              : Math.max(...batch.map((fragment) => fragment.endMs)),
          );
        for (const fragment of batch) this.consumed.add(this.key(fragment));
      },
    };
  }
}
