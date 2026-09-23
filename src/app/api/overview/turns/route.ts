import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/server/better-auth/server";
import { db } from "@/server/db";
import { memberTable } from "@/server/db/schema";
import { queuedPayloadSchema } from "@/lib/chat-turns";
import {
  enqueueChatInput,
  getChatTurnState,
  changeChatQueue,
  ChatTurnError,
} from "@/server/services/chat-turn.service";

async function actor() {
  const session = await getSession();
  if (!session?.user) throw new ChatTurnError("Unauthorized", 401);
  const active = session.session.activeOrganizationId;
  const memberships = await db
    .select({ organizationId: memberTable.organizationId })
    .from(memberTable)
    .where(
      and(
        eq(memberTable.userId, session.user.id),
        active ? eq(memberTable.organizationId, active) : undefined,
      ),
    )
    .limit(2);
  if (memberships.length !== 1)
    throw new ChatTurnError("Select an organization", 403);
  return {
    userId: session.user.id,
    organizationId: memberships[0]!.organizationId,
  };
}
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
    return Response.json(await getChatTurnState(await actor(), threadId), {
      headers: { "Cache-Control": "no-store" },
    });
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
    action: z.enum(["pause", "resume", "stop", "cancel", "retry"]),
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
    const identity = await actor();
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
