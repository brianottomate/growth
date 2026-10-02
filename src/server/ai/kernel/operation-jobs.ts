import "server-only";
import { after } from "next/server";
import { and, eq, desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import {
  assistantRunTable,
  assistantToolReceiptTable,
} from "@/server/db/schema";
import {
  startAssistantRun,
  completeAssistantRun,
  failAssistantRun,
} from "./journal";
import { buildGrowthToolRuntime } from "./runtime";
import { compactGrowthError } from "./errors";
import { policyForGrowthTool } from "./policy";
import {
  growthTool,
  type GrowthTool,
  type GrowthExecutionContext,
} from "./tool";

export const BACKGROUND_OPERATION_NAMES = [
  "sourceSyncWrite__discoverChannels",
  "sourceSyncWrite__scrapePosts",
  "sourceSyncWrite__syncOwnedContent",
  "sourceSyncWrite__syncWebsite",
  "sourceSyncWrite__syncBlog",
  "mediaAnalysisWrite__analyzeImage",
  "storefrontWrite__captureReference",
  "contentMediaWrite__importFromDrive",
] as const;
export type BackgroundOperationName =
  (typeof BACKGROUND_OPERATION_NAMES)[number];
export const BACKGROUND_OPERATIONS = new Set<string>(
  BACKGROUND_OPERATION_NAMES,
);
export const jobStartedDataSchema = z.strictObject({
  status: z.literal("started"),
  runId: z.string(),
  statusTool: z.literal("operationRead__status"),
});

export async function startOperationJob<Input, Output>(
  name: string,
  tool: GrowthTool<Input, Output>,
  input: Input,
  context: GrowthExecutionContext,
  schedule: (work: () => Promise<void>) => void = after,
) {
  const policy = policyForGrowthTool(name, input);
  if (policy.approval !== "none" || !policy.surfaces.includes(context.surface))
    throw new Error("This operation cannot execute as a background job");
  const runId = await startAssistantRun({
    organizationId: context.orgId,
    userId: context.userId,
    threadId: context.threadId,
    surface: context.surface,
    model: "growth-operation",
    contextManifest: {
      surface: context.surface,
      characters: 0,
      cachedPrefixCharacters: 0,
      sections: [],
    },
  });
  try {
    schedule(async () => {
      try {
        const runtime = buildGrowthToolRuntime({
          tools: { [name]: tool },
          identity: {
            orgId: context.orgId,
            userId: context.userId,
            threadId: context.threadId,
          },
          runId,
          surface: context.surface,
        });
        const execute = runtime.tools[name]?.execute;
        if (!execute) throw new Error("Operation is unavailable");
        const result = await execute(input, {
          toolCallId: `${runId}:work`,
          messages: [],
          context: runtime.context,
        });
        const failed =
          typeof result === "object" &&
          result !== null &&
          "ok" in result &&
          result.ok === false;
        if (failed)
          await failAssistantRun(
            runId,
            compactGrowthError(
              "Operation failed. Read its recorded result before retrying.",
            ),
          );
        else await completeAssistantRun(runId, { operation: name });
      } catch (error) {
        await failAssistantRun(runId, compactGrowthError(error));
      }
    });
  } catch (error) {
    await failAssistantRun(runId, compactGrowthError(error));
    throw error;
  }
  return {
    status: "started" as const,
    runId,
    statusTool: "operationRead__status" as const,
  };
}

export async function readOperationJob(
  runId: string,
  context: GrowthExecutionContext,
) {
  const run = await db.query.assistantRunTable.findFirst({
    where: and(
      eq(assistantRunTable.id, runId),
      eq(assistantRunTable.organizationId, context.orgId),
      eq(assistantRunTable.userId, context.userId),
      eq(assistantRunTable.model, "growth-operation"),
    ),
  });
  if (!run) throw new Error("Operation not found in your workspace");
  const receipt = await db.query.assistantToolReceiptTable.findFirst({
    where: eq(assistantToolReceiptTable.runId, runId),
    orderBy: desc(assistantToolReceiptTable.startedAt),
  });
  const expired =
    run.status === "running" &&
    Date.now() - run.startedAt.getTime() >
      (run.surface === "mcp" || run.surface === "invoke-growth" ? 14 : 6) *
        60_000;
  // Platform termination may prevent the failure callback. Expose uncertainty without replaying a write.
  if (expired)
    return {
      runId,
      status: "interrupted" as const,
      message:
        "The worker exceeded its execution window. Inspect saved state before starting another job.",
    };
  if (run.status === "running") return { runId, status: "running" as const };
  if (run.status === "failed")
    return {
      runId,
      status: "failed" as const,
      message:
        typeof run.error?.error === "string"
          ? run.error.error
          : "Operation failed",
      result: receipt?.output ?? null,
    };
  return {
    runId,
    status: "completed" as const,
    result: receipt?.output ?? null,
  };
}

export function operationStatusTool(results: z.ZodType[]) {
  const result = z.union(results).nullable();
  const data = z.discriminatedUnion("status", [
    z.object({ runId: z.string(), status: z.literal("running") }),
    z.object({
      runId: z.string(),
      status: z.literal("interrupted"),
      message: z.string(),
    }),
    z.object({
      runId: z.string(),
      status: z.literal("failed"),
      message: z.string(),
      result,
    }),
    z.object({ runId: z.string(), status: z.literal("completed"), result }),
  ]);
  return growthTool({
    description:
      "Read a background operation you started. Returns running, completed with the original operation result, failed, or interrupted. Inspect saved state after interruption before retrying. Jobs begin after the starting response finishes; do not repeatedly poll in the same turn.",
    inputSchema: z.object({ runId: z.string().min(1) }),
    resultSchema: z.object({
      ok: z.literal(true),
      action: z.literal("status"),
      data,
    }),
    execute: async ({ runId }, context) => ({
      ok: true as const,
      action: "status" as const,
      data: data.parse(await readOperationJob(runId, context)),
    }),
  });
}
