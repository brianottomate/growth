import "server-only";

import { z } from "zod";

import { env } from "@/env";

const MAX_TRANSCRIPTION_BYTES = 25 * 1024 * 1024;

const transcriptionSchema = z.object({
  text: z.string().default(""),
  language: z.string().optional(),
  words: z
    .array(
      z.object({
        word: z.string(),
        start: z.number(),
        end: z.number(),
      }),
    )
    .optional(),
});

function extensionFor(contentType: string) {
  if (contentType.includes("webm")) return "webm";
  if (contentType.includes("quicktime")) return "mov";
  if (contentType.includes("mpeg")) return "mpeg";
  return "mp4";
}

/**
 * Transcribe one durable video through OpenAI's hosted Whisper endpoint. Frame
 * extraction remains browser-local; this service avoids shipping a large ML
 * runtime to every operator and handles social-video codecs consistently.
 */
export async function transcribeVideoUrl(sourceUrl: string) {
  const source = await fetch(sourceUrl, {
    signal: AbortSignal.timeout(45_000),
  });
  if (!source.ok)
    throw new Error(
      `Could not download video for transcription (${source.status}).`,
    );
  const declaredSize = Number(source.headers.get("content-length") ?? 0);
  if (declaredSize > MAX_TRANSCRIPTION_BYTES)
    throw new Error("The video exceeds the 25 MB transcription limit.");
  const bytes = await source.arrayBuffer();
  if (bytes.byteLength > MAX_TRANSCRIPTION_BYTES)
    throw new Error("The video exceeds the 25 MB transcription limit.");

  const contentType =
    source.headers.get("content-type")?.split(";")[0] ?? "video/mp4";
  const form = new FormData();
  form.append(
    "file",
    new Blob([bytes], { type: contentType }),
    `reel.${extensionFor(contentType)}`,
  );
  // whisper-1 currently provides word-level timestamps with verbose_json.
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  form.append("temperature", "0");

  const response = await fetch(
    "https://api.openai.com/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: form,
      signal: AbortSignal.timeout(180_000),
    },
  );
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(
      `OpenAI transcription failed (${response.status})${detail ? `: ${detail}` : ""}`,
    );
  }
  const parsed = transcriptionSchema.parse(await response.json());
  return {
    language: parsed.language,
    text: parsed.text.trim(),
    words: (parsed.words ?? [])
      .map((word) => ({
        text: word.word.trim(),
        startMs: Math.max(0, Math.round(word.start * 1_000)),
        endMs: Math.max(0, Math.round(word.end * 1_000)),
      }))
      .filter((word) => word.text),
  };
}
