import "server-only";

import { z } from "zod";

import { env } from "@/env";

const MAX_TRANSCRIPTION_BYTES = 25 * 1024 * 1024;

/**
 * Proper nouns Whisper reliably mishears, spelled the way we spell them.
 *
 * The model has never seen "WanderOS" and renders it as the nearest English it
 * knows — a Booking Burglar take came back as "Wander West". These transcripts
 * are what ad copy gets drafted from, so a mangled product name propagates
 * into a live ad. Whisper's `prompt` is a vocabulary hint rather than an
 * instruction: terms in it are simply likelier to be produced.
 */
const WANDER_TERMS = [
  "Wander",
  "WanderOS",
  "wander.com",
  "List+",
  "Performance by Wander",
  "Guesty",
  "Hostaway",
  "Escapia",
  "OTA",
  "Airbnb",
  "Vrbo",
];

/**
 * The vocabulary hint, capped well inside Whisper's ~224-token prompt window.
 * A brand's own name goes first: it is the noun most likely to be said and
 * least likely to be known.
 */
export function vocabularyPrompt(extra: string[] = []): string {
  const terms = [...new Set([...extra, ...WANDER_TERMS].map((t) => t.trim()))]
    .filter(Boolean)
    .slice(0, 24);
  return `Glossary: ${terms.join(", ")}.`;
}

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
export async function transcribeVideoUrl(
  sourceUrl: string,
  options: {
    /** Brand-specific proper nouns to bias toward, e.g. the brand's own name. */
    vocabulary?: string[];
  } = {},
) {
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
  // Vocabulary bias, not an instruction — see WANDER_TERMS.
  form.append("prompt", vocabularyPrompt(options.vocabulary));

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
