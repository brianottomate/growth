/** Live concurrency/recovery tests. Requires an explicitly selected isolated Neon branch. */
import assert from "node:assert/strict";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import {
  assistantThreadTable as threads,
  assistantMessageTable as messages,
  memberTable,
  organizationTable,
  userTable,
} from "@/server/db/schema";
import {
  claimChatTurn,
  finishChatTurn,
  enqueueChatInput,
  getChatTurnState,
  changeChatQueue,
  readChatSteering,
  assertChatTurn,
} from "@/server/services/chat-turn.service";
if (
  !process.env.CHAT_QA_HOST ||
  new URL(process.env.DATABASE_URL!).hostname !== process.env.CHAT_QA_HOST
)
  throw new Error("Set CHAT_QA_HOST to the isolated test branch hostname");
const suffix = crypto.randomUUID();
const orgId = `chat_qa_org_${suffix}`;
const userId = `chat_qa_user_${suffix}`;
const outsiderId = `chat_qa_outside_${suffix}`;
const actor = { userId, organizationId: orgId };
const threadId = `chat_qa_thread_${suffix}`;
const payload = (id: string, text = "Draft a local plan") => ({
  message: {
    id,
    role: "user" as const,
    parts: [{ type: "text" as const, text }],
  },
  context: { brandId: "original-brand", pagePath: "/app/campaigns" },
});
let checks = 0;
function pass(label: string) {
  checks++;
  console.log(`PASS ${label}`);
}
try {
  await db.insert(userTable).values([
    { id: userId, name: "Chat QA" },
    { id: outsiderId, name: "Chat outsider" },
  ]);
  await db.insert(organizationTable).values({ id: orgId, name: "Chat QA" });
  await db.insert(memberTable).values({ userId, organizationId: orgId });
  await db
    .insert(threads)
    .values({ id: threadId, organizationId: orgId, createdBy: userId });
  const a = payload(`a-${suffix}`);
  await Promise.all([
    enqueueChatInput(actor, threadId, a),
    enqueueChatInput(actor, threadId, a),
  ]);
  assert.equal((await getChatTurnState(actor, threadId)).inputs.length, 1);
  pass("duplicate acceptance has one durable input");
  const contenders = await Promise.allSettled([
    claimChatTurn(actor, threadId, a.message.id),
    claimChatTurn(actor, threadId, a.message.id),
  ]);
  assert.equal(contenders.filter((r) => r.status === "fulfilled").length, 1);
  const winner = contenders.find((r) => r.status === "fulfilled")!;
  assert.equal(winner.status, "fulfilled");
  const turn = winner.value.turnId;
  pass("two tabs cannot claim the same turn");
  const b = payload(`b-${suffix}`, "Also draft a second option");
  await enqueueChatInput(actor, threadId, b);
  assert.equal(
    (await getChatTurnState(actor, threadId)).inputs[1]!.payload.context
      .brandId,
    "original-brand",
  );
  pass("queued context remains frozen");
  await assert.rejects(claimChatTurn(actor, threadId, b.message.id));
  await assert.rejects(
    enqueueChatInput(
      { userId: outsiderId, organizationId: orgId },
      threadId,
      payload(`outside-${suffix}`),
    ),
  );
  pass("access is checked at acceptance and execution");
  const c = payload(`c-${suffix}`, "Use the revised audience");
  await enqueueChatInput(actor, threadId, c, turn);
  assert.equal((await readChatSteering(threadId, turn))[0]!.id, c.message.id);
  assert.equal((await readChatSteering(threadId, turn)).length, 0);
  assert.equal(
    (await getChatTurnState(actor, threadId)).messages[0]!.id,
    c.message.id,
  );
  pass("correction is durable and consumed once");
  const late = payload(`late-${suffix}`, "A last correction");
  await enqueueChatInput(actor, threadId, late, turn);
  await finishChatTurn(threadId, turn, a.message.id);
  assert.equal(
    (await getChatTurnState(actor, threadId)).inputs.find(
      (i) => i.id === late.message.id,
    )!.status,
    "queued",
  );
  pass("late correction becomes a follow-up");
  await changeChatQueue(
    actor,
    threadId,
    "edit",
    b.message.id,
    "Edited follow-up",
  );
  assert.equal(
    (await getChatTurnState(actor, threadId)).inputs[0]!.payload.message
      .parts[0]!.type,
    "text",
  );
  await changeChatQueue(actor, threadId, "pause");
  await assert.rejects(claimChatTurn(actor, threadId));
  await assert.rejects(claimChatTurn(actor, threadId, b.message.id));
  await changeChatQueue(actor, threadId, "resume");
  const next = await claimChatTurn(actor, threadId, b.message.id);
  await changeChatQueue(actor, threadId, "stop");
  await assert.rejects(assertChatTurn(threadId, next.turnId));
  await finishChatTurn(threadId, next.turnId, b.message.id);
  let state = await getChatTurnState(actor, threadId);
  assert.equal(state.paused, true);
  assert.equal(state.inputs[0]!.status, "failed");
  pass("stop fences tools and retains failed input for review");
  await changeChatQueue(actor, threadId, "cancel", b.message.id);
  await changeChatQueue(actor, threadId, "resume");
  const expiring = await claimChatTurn(actor, threadId, late.message.id);
  await db
    .update(threads)
    .set({ activeTurnExpiresAt: new Date(0) })
    .where(eq(threads.id, threadId));
  state = await getChatTurnState(actor, threadId);
  assert.equal(state.activeTurnId, null);
  assert.equal(state.paused, true);
  await finishChatTurn(threadId, expiring.turnId, late.message.id);
  assert.equal(
    (await getChatTurnState(actor, threadId)).inputs[0]!.status,
    "failed",
  );
  pass("expired lease pauses queue and rejects stale completion");
  await changeChatQueue(actor, threadId, "retry", late.message.id);
  await changeChatQueue(actor, threadId, "resume");
  await db.insert(messages).values({
    threadId,
    clientMessageId: `approval-${suffix}`,
    role: "assistant",
    message: {
      id: `approval-${suffix}`,
      role: "assistant",
      parts: [
        {
          type: "tool-adsWrite",
          toolCallId: "publish-qa",
          state: "approval-requested",
          input: {},
          approval: { id: "approval-qa" },
        },
      ],
    },
  });
  await assert.rejects(
    claimChatTurn(actor, threadId, late.message.id),
    /approval/,
  );
  pass("queued messages cannot bypass a pending provider approval");
  console.log(`${checks} live checks passed`);
} finally {
  await db.delete(threads).where(eq(threads.id, threadId));
  await db
    .delete(memberTable)
    .where(
      and(
        eq(memberTable.userId, userId),
        eq(memberTable.organizationId, orgId),
      ),
    );
  await db.delete(organizationTable).where(eq(organizationTable.id, orgId));
  await db.delete(userTable).where(inArray(userTable.id, [userId, outsiderId]));
}
