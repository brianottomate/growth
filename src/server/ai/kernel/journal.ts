import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/server/db";
import { assistantRunTable, type AssistantRun } from "@/server/db/schema";
import type { GrowthContextManifest } from "./context";
import type { GrowthCompactError } from "./errors";

export async function startAssistantRun(input: {
  organizationId: string;
  userId: string;
  threadId?: string;
  surface: GrowthContextManifest["surface"];
  model?: string;
  contextManifest: GrowthContextManifest;
}): Promise<string> {
  const [run] = await db
    .insert(assistantRunTable)
    .values({
      organizationId: input.organizationId,
      userId: input.userId,
      threadId: input.threadId ?? null,
      surface: input.surface,
      model: input.model,
      contextManifest: input.contextManifest,
    })
    .returning({ id: assistantRunTable.id });
  if (!run) throw new Error("Could not start Growth assistant run");
  return run.id;
}

export async function completeAssistantRun(
  runId: string,
  summary: NonNullable<AssistantRun["summary"]>,
): Promise<void> {
  await db
    .update(assistantRunTable)
    .set({ status: "completed", summary, finishedAt: new Date() })
    .where(
      and(
        eq(assistantRunTable.id, runId),
        eq(assistantRunTable.status, "running"),
      ),
    );
}

export async function failAssistantRun(
  runId: string,
  error: GrowthCompactError,
): Promise<void> {
  await db
    .update(assistantRunTable)
    .set({ status: "failed", error: { ...error }, finishedAt: new Date() })
    .where(
      and(
        eq(assistantRunTable.id, runId),
        eq(assistantRunTable.status, "running"),
      ),
    );
}
