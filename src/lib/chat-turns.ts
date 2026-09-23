import { isToolUIPart, type UIMessage } from "ai";
import { z } from "zod";

export const queuedMessageSchema = z.object({
  id: z.string().min(1).max(150),
  role: z.literal("user"),
  parts: z
    .array(
      z.union([
        z.object({ type: z.literal("text"), text: z.string().max(100_000) }),
        z.object({
          type: z.literal("file"),
          mediaType: z.string(),
          url: z.url(),
          filename: z.string().optional(),
        }),
      ]),
    )
    .min(1)
    .max(25),
});
export const queuedPayloadSchema = z.object({
  message: queuedMessageSchema,
  context: z.record(z.string(), z.unknown()).default({}),
});
export type QueuedPayload = z.infer<typeof queuedPayloadSchema>;
export type PendingChatInput = {
  id: string;
  owned: boolean;
  status:
    | "queued"
    | "steering"
    | "running"
    | "completed"
    | "failed"
    | "cancelled";
  payload: QueuedPayload;
  error: string | null;
};
export type ChatTurnSnapshot = {
  activeTurnId: string | null;
  paused: boolean;
  stopRequested: boolean;
  inputs: PendingChatInput[];
  messages: UIMessage[];
};
export function hasPendingApproval(messages: UIMessage[]) {
  const tail = messages.at(-1);
  return (
    tail?.role === "assistant" &&
    tail.parts.some(
      (part) => isToolUIPart(part) && part.state === "approval-requested",
    )
  );
}
export function chatInputText(input: PendingChatInput) {
  return input.payload.message.parts
    .flatMap((part) =>
      part.type === "text" ? [part.text] : [part.filename ?? "Attachment"],
    )
    .join(" ");
}
