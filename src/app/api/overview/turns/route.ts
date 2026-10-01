import { chatActor } from "@/server/services/chat-actor";
import { z } from "zod";
import { queuedPayloadSchema } from "@/lib/chat-turns";
import {
  enqueueChatInput,
  getChatTurnState,
  getChatInputResult,
  changeChatQueue,
  ChatTurnError,
} from "@/server/services/chat-turn.service";

function failure(error: unknown) {
  return Response.json(
    { error: error instanceof Error ? error.message : "Request failed" },
    {
      status:
        error instanceof ChatTurnError
          ? error.status
          : error instanceof z.ZodError
            ? 400
            : 500,
    },
  );
}
export async function GET(req: Request) {
  try {
    const threadId = z
      .string()
      .min(1)
      .parse(new URL(req.url).searchParams.get("threadId"));
    const identity = await chatActor();
    const inputId = new URL(req.url).searchParams.get("inputId");
    return Response.json(
      inputId
        ? await getChatInputResult(identity, threadId, inputId)
        : await getChatTurnState(identity, threadId),
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return failure(error);
  }
}
const command = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("enqueue"),
    threadId: z.string().min(1),
    payload: queuedPayloadSchema,
    targetTurnId: z.string().optional(),
  }),
  z.object({
    action: z.enum(["pause", "resume", "stop", "cancel", "retry", "steer"]),
    threadId: z.string().min(1),
    id: z.string().optional(),
  }),
  z.object({
    action: z.literal("edit"),
    threadId: z.string().min(1),
    id: z.string(),
    text: z.string().trim().min(1).max(100_000),
  }),
]);
export async function POST(req: Request) {
  try {
    const input = command.parse(await req.json());
    const identity = await chatActor();
    if (input.action === "enqueue")
      return Response.json(
        await enqueueChatInput(
          identity,
          input.threadId,
          input.payload,
          input.targetTurnId,
        ),
      );
    await changeChatQueue(
      identity,
      input.threadId,
      input.action,
      input.id,
      "text" in input ? input.text : undefined,
    );
    return Response.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
