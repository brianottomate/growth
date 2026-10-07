import { sameTurnFocus } from "@/lib/assistant-focus";
import { isDeepStrictEqual } from "node:util";
import "server-only";
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import type { UIMessage } from "ai";
import { db, withTransaction } from "@/server/db";
import {
  assistantInputTable as inputs,
  assistantMessageTable as messages,
  assistantRunTable as runs,
  assistantThreadTable as threads,
  memberTable,
} from "@/server/db/schema";
import { createId } from "@/server/db/utils";
import { hasPendingApproval, type QueuedPayload } from "@/lib/chat-turns";

export type ChatActor = { userId: string; organizationId: string };
type Tx = Parameters<Parameters<typeof withTransaction>[0]>[0];
export class ChatTurnError extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}
// Longer than the route's 300s hard limit. Expired work requires explicit recovery.
const LEASE_MS = 360_000;
async function lock(tx: Tx, threadId: string, actor?: ChatActor) {
  const [thread] = await tx
    .select()
    .from(threads)
    .where(eq(threads.id, threadId))
    .for("update");
  if (
    !thread ||
    (actor &&
      (thread.organizationId !== actor.organizationId ||
        (thread.visibility !== "shared" && thread.createdBy !== actor.userId)))
  )
    throw new ChatTurnError("Session not found", 404);
  if (actor) {
    const [member] = await tx
      .select({ id: memberTable.id })
      .from(memberTable)
      .where(
        and(
          eq(memberTable.userId, actor.userId),
          eq(memberTable.organizationId, actor.organizationId),
        ),
      );
    if (!member) throw new ChatTurnError("Organization access required", 403);
  }
  return thread;
}
async function recover(tx: Tx, thread: typeof threads.$inferSelect) {
  if (
    !thread.activeTurnId ||
    (thread.activeTurnExpiresAt &&
      thread.activeTurnExpiresAt.getTime() > Date.now())
  )
    return thread;
  await tx
    .update(inputs)
    .set({
      status: "failed",
      error:
        "The response stopped before completion. Review the conversation before retrying.",
    })
    .where(and(eq(inputs.threadId, thread.id), eq(inputs.status, "running")));
  await tx
    .update(inputs)
    .set({ status: "queued", targetTurnId: null })
    .where(and(eq(inputs.threadId, thread.id), eq(inputs.status, "steering")));
  // A turn killed by the platform never reaches its own finish; close its run.
  await tx
    .update(runs)
    .set({
      status: "failed",
      error: {
        code: "turn_expired",
        message: "The turn expired before finishing",
      },
      finishedAt: new Date(),
    })
    .where(and(eq(runs.threadId, thread.id), eq(runs.status, "running")));
  const [updated] = await tx
    .update(threads)
    .set({
      activeTurnId: null,
      activeTurnExpiresAt: null,
      queuePaused: true,
      stopRequested: false,
    })
    .where(eq(threads.id, thread.id))
    .returning();
  return updated!;
}
async function history(tx: Tx, threadId: string) {
  return tx
    .select()
    .from(messages)
    .where(eq(messages.threadId, threadId))
    .orderBy(asc(messages.createdAt), asc(messages.id));
}
export async function getChatTurnState(actor: ChatActor, threadId: string) {
  return withTransaction(async (tx) => {
    const thread = await recover(tx, await lock(tx, threadId, actor));
    const pending = await tx
      .select()
      .from(inputs)
      .where(
        and(
          eq(inputs.threadId, threadId),
          inArray(inputs.status, ["queued", "steering", "running", "failed"]),
        ),
      )
      .orderBy(asc(inputs.sequence));
    const running = pending.find((input) => input.status === "running");
    return {
      steering: {
        context:
          thread.activeTurnId && !thread.stopRequested && running
            ? running.payload.context
            : null,
        reason: thread.stopRequested
          ? "Current work is stopping. Queue a follow-up."
          : thread.activeTurnId && !running
            ? "Steering is unavailable during this continuation. Queue a follow-up."
            : null,
      },
      activeTurnId: thread.activeTurnId,
      paused: thread.queuePaused,
      stopRequested: thread.stopRequested,
      inputs: pending.map((input) => ({
        ...input,
        owned: input.createdBy === actor.userId,
      })),
      messages: (await history(tx, threadId)).map((row) => row.message),
    };
  });
}
export async function enqueueChatInput(
  actor: ChatActor,
  threadId: string,
  payload: QueuedPayload,
  targetTurnId?: string,
) {
  return withTransaction(async (tx) => {
    const thread = await recover(tx, await lock(tx, threadId, actor));
    const [existing] = await tx
      .select()
      .from(inputs)
      .where(eq(inputs.id, payload.message.id));
    if (existing) {
      if (existing.threadId !== threadId || existing.createdBy !== actor.userId)
        throw new ChatTurnError("Input ID is already in use");
      if (!isDeepStrictEqual(existing.payload, payload))
        throw new ChatTurnError(
          "This input ID already contains a different message",
        );
      return existing;
    }
    const pending = await tx
      .select({ id: inputs.id })
      .from(inputs)
      .where(
        and(
          eq(inputs.threadId, threadId),
          inArray(inputs.status, ["queued", "steering", "running", "failed"]),
        ),
      );
    if (pending.length >= 30)
      throw new ChatTurnError(
        "This session has 30 pending messages. Clear some before adding another.",
      );
    if (
      targetTurnId &&
      payload.message.parts.some((part) => part.type !== "text")
    )
      throw new ChatTurnError("Corrections accept text only", 400);
    const steering =
      targetTurnId &&
      targetTurnId === thread.activeTurnId &&
      !thread.stopRequested;
    if (steering) {
      const [running] = await tx
        .select({ payload: inputs.payload })
        .from(inputs)
        .where(and(eq(inputs.threadId, threadId), eq(inputs.status, "running")))
        .limit(1);
      if (!running || !sameTurnFocus(running.payload.context, payload.context))
        throw new ChatTurnError(
          "The focus changed. Queue this message as a new turn.",
          409,
        );
    }
    const [item] = await tx
      .insert(inputs)
      .values({
        id: payload.message.id,
        threadId,
        createdBy: actor.userId,
        payload,
        status: steering ? "steering" : "queued",
        targetTurnId: steering ? targetTurnId : null,
      })
      .returning();
    return item!;
  });
}
export async function changeChatQueue(
  actor: ChatActor,
  threadId: string,
  action: "pause" | "resume" | "stop" | "cancel" | "edit" | "retry" | "steer",
  id?: string,
  text?: string,
) {
  return withTransaction(async (tx) => {
    const thread = await recover(tx, await lock(tx, threadId, actor));
    if (action === "pause" || action === "resume" || action === "stop") {
      await tx
        .update(threads)
        .set({
          queuePaused: action !== "resume",
          ...(action === "stop"
            ? { stopRequested: Boolean(thread.activeTurnId) }
            : {}),
        })
        .where(eq(threads.id, threadId));
      return;
    }
    const [input] = await tx
      .select()
      .from(inputs)
      .where(
        and(
          eq(inputs.id, id ?? ""),
          eq(inputs.threadId, threadId),
          eq(inputs.createdBy, actor.userId),
        ),
      );
    if (!input || !["queued", "failed", "steering"].includes(input.status))
      throw new ChatTurnError(
        "This message has already started or is unavailable",
      );
    if (action === "steer") {
      if (
        input.status !== "queued" ||
        !thread.activeTurnId ||
        thread.stopRequested
      )
        throw new ChatTurnError(
          "Current work finished. Keep this message queued.",
        );
      const [running] = await tx
        .select({ payload: inputs.payload })
        .from(inputs)
        .where(and(eq(inputs.threadId, threadId), eq(inputs.status, "running")))
        .limit(1);
      if (
        !running ||
        !sameTurnFocus(running.payload.context, input.payload.context) ||
        input.payload.message.parts.some((part) => part.type !== "text")
      )
        throw new ChatTurnError(
          "Steering requires text about the current work.",
        );
      await tx
        .update(inputs)
        .set({ status: "steering", targetTurnId: thread.activeTurnId })
        .where(eq(inputs.id, input.id));
      return;
    }
    if (action === "edit" && input.status !== "queued")
      throw new ChatTurnError("Only queued messages can be edited");
    await tx
      .update(inputs)
      .set(
        action === "cancel"
          ? { status: "cancelled" }
          : action === "retry"
            ? { status: "queued", error: null, targetTurnId: null }
            : {
                payload: {
                  ...input.payload,
                  message: {
                    ...input.payload.message,
                    parts: [
                      { type: "text", text: text ?? "" },
                      ...input.payload.message.parts.filter(
                        (part) => part.type === "file",
                      ),
                    ],
                  },
                },
              },
      )
      .where(eq(inputs.id, input.id));
  });
}
export async function claimChatTurn(
  actor: ChatActor,
  threadId: string,
  inputId?: string,
  approvalContinuation = false,
) {
  return withTransaction(async (tx) => {
    const thread = await recover(tx, await lock(tx, threadId, actor));
    if (thread.activeTurnId)
      throw new ChatTurnError("A response is already running in this session");
    if (!inputId && !approvalContinuation)
      throw new ChatTurnError("Submit or retry through the durable queue");
    let payload: QueuedPayload | undefined;
    if (inputId) {
      if (thread.queuePaused) throw new ChatTurnError("The queue is paused");
      if (
        hasPendingApproval(
          (await history(tx, threadId)).map((row) => row.message),
        )
      )
        throw new ChatTurnError(
          "Resolve the pending approval before continuing the queue",
        );
      const [next] = await tx
        .select()
        .from(inputs)
        .where(and(eq(inputs.threadId, threadId), eq(inputs.status, "queued")))
        .orderBy(asc(inputs.sequence))
        .limit(1);
      if (!next || next.id !== inputId || next.createdBy !== actor.userId)
        throw new ChatTurnError("This input cannot run yet");
      payload = next.payload;
      await tx
        .update(inputs)
        .set({ status: "running", error: null })
        .where(eq(inputs.id, inputId));
    }
    const turnId = createId("turn");
    await tx
      .update(threads)
      .set({
        activeTurnId: turnId,
        activeTurnExpiresAt: new Date(Date.now() + LEASE_MS),
        stopRequested: false,
      })
      .where(eq(threads.id, threadId));
    return { turnId, payload };
  });
}
/**
 * Check the turn is still ours and extend its lease. Called before every model
 * step and tool call, so a working turn never expires mid-run while a crashed
 * one frees the thread within one lease.
 */
export async function assertChatTurn(threadId: string, turnId: string) {
  const [renewed] = await db
    .update(threads)
    .set({ activeTurnExpiresAt: new Date(Date.now() + LEASE_MS) })
    .where(
      and(
        eq(threads.id, threadId),
        eq(threads.activeTurnId, turnId),
        eq(threads.stopRequested, false),
        gt(threads.activeTurnExpiresAt, new Date()),
      ),
    )
    .returning({ id: threads.id });
  if (!renewed)
    throw new ChatTurnError("The response was stopped or its turn expired");
}
export async function readChatSteering(
  threadId: string,
  turnId: string,
): Promise<UIMessage[]> {
  return withTransaction(async (tx) => {
    const thread = await lock(tx, threadId);
    if (thread.activeTurnId !== turnId || thread.stopRequested)
      throw new ChatTurnError("The response was stopped");
    const pending = await tx
      .select()
      .from(inputs)
      .where(
        and(
          eq(inputs.threadId, threadId),
          eq(inputs.targetTurnId, turnId),
          eq(inputs.status, "steering"),
        ),
      )
      .orderBy(asc(inputs.sequence));
    for (const input of pending) {
      await tx
        .insert(messages)
        .values({
          threadId,
          clientMessageId: input.id,
          role: "user",
          message: input.payload.message,
        })
        .onConflictDoNothing();
      await tx
        .update(inputs)
        .set({ status: "completed" })
        .where(eq(inputs.id, input.id));
    }
    return pending.map((input) => input.payload.message);
  });
}
export async function finishChatTurn(
  threadId: string,
  turnId: string,
  inputId: string | undefined,
  error?: string,
  persist?: (tx: Tx) => Promise<void>,
) {
  return withTransaction(async (tx) => {
    const thread = await lock(tx, threadId);
    if (thread.activeTurnId !== turnId) return;
    if (persist) await persist(tx);
    const stopped = thread.stopRequested;
    if (inputId)
      await tx
        .update(inputs)
        .set({
          status: error || stopped ? "failed" : "completed",
          error:
            error ??
            (stopped
              ? "Stopped. Review completed actions before retrying."
              : null),
        })
        .where(and(eq(inputs.id, inputId), eq(inputs.threadId, threadId)));
    // A correction arriving after the final model step becomes a follow-up.
    await tx
      .update(inputs)
      .set({ status: "queued", targetTurnId: null })
      .where(
        and(
          eq(inputs.threadId, threadId),
          eq(inputs.targetTurnId, turnId),
          eq(inputs.status, "steering"),
        ),
      );
    await tx
      .update(threads)
      .set({
        activeTurnId: null,
        activeTurnExpiresAt: null,
        stopRequested: false,
        queuePaused: Boolean(error || stopped || thread.queuePaused),
      })
      .where(eq(threads.id, threadId));
  });
}

/** Resolve a voice request from its durable input and explicitly linked reply. */
export async function getChatInputResult(
  actor: ChatActor,
  threadId: string,
  inputId: string,
) {
  return withTransaction(async (tx) => {
    await recover(tx, await lock(tx, threadId, actor));
    const [input] = await tx
      .select()
      .from(inputs)
      .where(
        and(
          eq(inputs.id, inputId),
          eq(inputs.threadId, threadId),
          eq(inputs.createdBy, actor.userId),
        ),
      );
    if (!input) throw new ChatTurnError("Input not found", 404);
    const saved = await history(tx, threadId);
    const reply = saved
      .map((row) => row.message)
      .reverse()
      .find(
        (message) =>
          message.role === "assistant" &&
          (
            message.metadata as { queueInputIds?: string[] } | undefined
          )?.queueInputIds?.includes(inputId),
      );
    const error =
      input.error ??
      (reply?.metadata as { queueTurnError?: string } | undefined)
        ?.queueTurnError ??
      null;
    return {
      status: error ? "failed" : input.status,
      error,
      reply: reply ?? null,
    };
  });
}
