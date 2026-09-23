import "server-only";

import type {
  InferToolInput,
  InferToolOutput,
  Tool,
  ToolExecutionOptions,
  ToolSet,
} from "ai";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/server/db";
import { assistantToolReceiptTable, memberTable } from "@/server/db/schema";
import { compactGrowthError } from "./errors";
import { policyForGrowthTool, type GrowthActionPolicy } from "./policy";
import type { GrowthExecutionContext } from "./tool";

export interface GrowthRuntimeIdentity {
  orgId: string;
  userId: string;
  threadId?: string;
}

export { normalizeGrowthJson } from "./output";
import { normalizeGrowthJson, type JsonValue } from "./output";

function isErrorOutput(
  value: JsonValue,
): value is JsonValue & { ok: false; error: { message: string } } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    value.ok === false &&
    typeof value.error === "object" &&
    value.error !== null &&
    !Array.isArray(value.error) &&
    typeof value.error.message === "string"
  );
}

function failureOutput(error: unknown, action?: string) {
  const compact = compactGrowthError(error);
  return {
    ok: false as const,
    ...(action ? { action } : {}),
    error: {
      code: compact.code,
      message: compact.error,
      suggestedAction: compact.suggestedAction,
    },
  };
}

async function assertOrganizationAccess(context: GrowthExecutionContext) {
  const membership = await db.query.memberTable.findFirst({
    where: and(
      eq(memberTable.userId, context.userId),
      eq(memberTable.organizationId, context.orgId),
    ),
    columns: { id: true },
  });
  if (!membership) {
    throw new Error("The user no longer has access to this organization.");
  }
}

async function executeWithReceipt(input: {
  name: string;
  policy: GrowthActionPolicy;
  value: unknown;
  options: ToolExecutionOptions<GrowthExecutionContext>;
  execute: (
    value: unknown,
    options: ToolExecutionOptions<GrowthExecutionContext>,
  ) => unknown;
}): Promise<JsonValue> {
  const context = input.options.context;
  const startedAt = new Date();
  const normalizedInput = normalizeGrowthJson(input.value);
  const [created] = await db
    .insert(assistantToolReceiptTable)
    .values({
      runId: context.runId,
      threadId: context.threadId ?? null,
      toolCallId: input.options.toolCallId,
      toolName: input.name,
      policy: { ...input.policy },
      input: normalizedInput,
      startedAt,
    })
    .onConflictDoNothing()
    .returning({ id: assistantToolReceiptTable.id });

  if (!created) {
    const existing = await db.query.assistantToolReceiptTable.findFirst({
      where: and(
        eq(assistantToolReceiptTable.runId, context.runId),
        eq(assistantToolReceiptTable.toolCallId, input.options.toolCallId),
      ),
    });
    if (existing?.output !== null && existing?.output !== undefined) {
      return existing.output as JsonValue;
    }
    return normalizeGrowthJson(
      failureOutput(
        new Error(
          `Tool call ${input.options.toolCallId} is already ${existing?.status ?? "running"}`,
        ),
        typeof normalizedInput === "object" &&
          normalizedInput !== null &&
          !Array.isArray(normalizedInput) &&
          typeof normalizedInput.action === "string"
          ? normalizedInput.action
          : undefined,
      ),
    );
  }

  try {
    await assertOrganizationAccess(context);
    if (!input.policy.surfaces.includes(context.surface)) {
      throw new Error(
        `${input.name} is not available on the ${context.surface} surface.`,
      );
    }
    const execution = await input.execute(input.value, input.options);
    if (
      typeof execution === "object" &&
      execution !== null &&
      Symbol.asyncIterator in execution
    ) {
      throw new Error("Streaming Growth tool outputs are not supported");
    }
    const output = normalizeGrowthJson(execution);
    const failed = isErrorOutput(output);
    const finishedAt = new Date();
    await db
      .update(assistantToolReceiptTable)
      .set({
        status: failed ? "failed" : "completed",
        output,
        ...(failed ? { error: output as Record<string, unknown> } : {}),
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
      })
      .where(eq(assistantToolReceiptTable.id, created.id));
    return output;
  } catch (error) {
    const action =
      typeof normalizedInput === "object" &&
      normalizedInput !== null &&
      !Array.isArray(normalizedInput) &&
      typeof normalizedInput.action === "string"
        ? normalizedInput.action
        : undefined;
    const output = failureOutput(error, action);
    const finishedAt = new Date();
    await db
      .update(assistantToolReceiptTable)
      .set({
        status: "failed",
        error: output.error,
        output,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
      })
      .where(eq(assistantToolReceiptTable.id, created.id));
    return output;
  }
}

/** Add receipts, compact errors, and execute-time org access to native tools. */
export function withGrowthExecution<Tools extends ToolSet>(
  tools: Tools,
  beforeExecute?: () => Promise<void>,
): {
  [Name in keyof Tools]: Tool<
    InferToolInput<Tools[Name]>,
    InferToolOutput<Tools[Name]> | JsonValue,
    GrowthExecutionContext
  >;
} {
  return Object.fromEntries(
    Object.entries(tools).map(([name, definition]) => {
      return [
        name,
        {
          ...definition,
          outputSchema: z.json(),
          execute: definition.execute
            ? async (
                value: unknown,
                options: ToolExecutionOptions<GrowthExecutionContext>,
              ) => {
                await beforeExecute?.();
                return executeWithReceipt({
                  name,
                  policy: policyForGrowthTool(name, value),
                  value,
                  options,
                  execute: definition.execute as (
                    value: unknown,
                    executionOptions: ToolExecutionOptions<GrowthExecutionContext>,
                  ) => unknown,
                });
              }
            : undefined,
        },
      ];
    }),
  ) as never;
}

export function buildGrowthToolRuntime<Tools extends ToolSet>(input: {
  tools: Tools;
  identity: GrowthRuntimeIdentity;
  runId: string;
  surface: GrowthExecutionContext["surface"];
  beforeExecute?: () => Promise<void>;
}) {
  const tools = withGrowthExecution(input.tools, input.beforeExecute);
  const context: GrowthExecutionContext = {
    ...input.identity,
    runId: input.runId,
    surface: input.surface,
  };
  const toolsContext = Object.fromEntries(
    Object.keys(tools).map((name) => [name, context]),
  ) as { [Name in keyof Tools]: GrowthExecutionContext };
  return {
    tools,
    context,
    toolsContext,
    toolApproval: (options: {
      toolCall: { toolName: string; input: unknown };
    }) =>
      options.toolCall.toolName !== "toolSearch" &&
      policyForGrowthTool(options.toolCall.toolName, options.toolCall.input)
        .approval === "user"
        ? ("user-approval" as const)
        : ("not-applicable" as const),
  };
}
