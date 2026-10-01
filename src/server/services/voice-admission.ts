import "server-only";
import { and, eq, gt, sql } from "drizzle-orm";
import { db, withTransaction } from "@/server/db";
import { assistantRunTable } from "@/server/db/schema";
import { ChatTurnError, type ChatActor } from "./chat-turn.service";

/** Admission records describe session setup; they never stand for completed work. */
export async function admitVoice(actor: ChatActor, model: string) {
  return withTransaction(async (tx) => {
    // Serialize this user's admission across organizations and Vercel instances.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`growth-speech:${actor.userId}`}, 0))`,
    );
    const recent = await tx
      .select({ id: assistantRunTable.id })
      .from(assistantRunTable)
      .where(
        and(
          eq(assistantRunTable.userId, actor.userId),
          eq(assistantRunTable.surface, "speech-session-setup"),
          gt(assistantRunTable.startedAt, new Date(Date.now() - 3_600_000)),
        ),
      )
      .limit(20);
    if (recent.length >= 20)
      throw new ChatTurnError(
        "Voice session limit reached. Try again later.",
        429,
      );
    const [reservation] = await tx
      .insert(assistantRunTable)
      .values({
        organizationId: actor.organizationId,
        userId: actor.userId,
        surface: "speech-session-setup",
        model,
        summary: { operation: "session-setup" },
      })
      .returning({ id: assistantRunTable.id });
    return reservation!.id;
  });
}
export async function finishVoiceAdmission(id: string, connected: boolean) {
  await db
    .update(assistantRunTable)
    .set({
      status: connected ? "completed" : "failed",
      finishedAt: new Date(),
      summary: { operation: "session-setup", connected },
    })
    .where(eq(assistantRunTable.id, id));
}
