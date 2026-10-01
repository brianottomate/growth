import { z } from "zod";
import { env } from "@/env";
import { chatActor } from "@/server/services/chat-actor";
import { ChatTurnError } from "@/server/services/chat-turn.service";
import {
  admitVoice,
  finishVoiceAdmission,
} from "@/server/services/voice-admission";
export const maxDuration = 60;
const headers = { "Cache-Control": "no-store" };
export async function POST(request: Request) {
  let admissionId: string | undefined;
  let connected = false;
  try {
    const actor = await chatActor();
    const { sdp } = z
      .object({
        // Preserve the final CRLF required by the provider's SDP parser.
        sdp: z
          .string()
          .min(1)
          .max(100_000)
          .refine((value) => value.trim().length > 0),
      })
      .parse(await request.json());
    if (!env.OPENAI_API_KEY)
      return Response.json(
        { error: "Dictation is not configured." },
        { status: 503, headers },
      );
    admissionId = await admitVoice(actor, "gpt-live-transcribe");
    const body = new FormData();
    body.set("sdp", sdp);
    body.set(
      "session",
      JSON.stringify({
        type: "transcription",
        audio: {
          input: {
            transcription: { model: "gpt-live-transcribe", delay: "low" },
            turn_detection: null,
          },
        },
      }),
    );
    const answer = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body,
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(45_000)]),
    });
    if (!answer.ok) throw new Error("Provider unavailable");
    const sdpAnswer = await answer.text();
    connected = true;
    return Response.json({ sdp: sdpAnswer }, { headers });
  } catch (error) {
    const status =
      error instanceof ChatTurnError
        ? error.status
        : error instanceof z.ZodError || error instanceof SyntaxError
          ? 400
          : 502;
    return Response.json(
      {
        error:
          status === 502
            ? "Dictation could not connect. Try again."
            : status === 400
              ? "Invalid dictation request."
              : (error as Error).message,
      },
      { status, headers },
    );
  } finally {
    if (admissionId)
      await finishVoiceAdmission(admissionId, connected).catch(() => undefined);
  }
}
