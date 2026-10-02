import "server-only";

import type { ToolExecutionOptions } from "ai";
import { and, eq } from "drizzle-orm";
import type { z } from "zod";

import { db } from "@/server/db";
import { assistantToolReceiptTable, memberTable } from "@/server/db/schema";
import { executeReceipt, type ReceiptStore } from "./receipt-execution";
import { policyForGrowthTool } from "./policy";
import type { GrowthCapabilityError, GrowthExecutionContext } from "./tool";
import type { GrowthCatalog } from "./operations";

export interface GrowthRuntimeIdentity {
  orgId: string;
  userId: string;
  threadId?: string;
}

export { normalizeGrowthJson } from "./output";
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

const receipts: ReceiptStore = {
  async claim({ name, value, context, toolCallId, policy, startedAt }) {
    const [created] = await db
      .insert(assistantToolReceiptTable)
      .values({
        runId: context.runId,
        threadId: context.threadId ?? null,
        toolCallId,
        toolName: name,
        policy: { ...policy },
        input: value,
        startedAt,
      })
      .onConflictDoNothing()
      .returning({ id: assistantToolReceiptTable.id });
    return created?.id;
  },
  read: (runId, toolCallId) =>
    db.query.assistantToolReceiptTable.findFirst({
      where: and(
        eq(assistantToolReceiptTable.runId, runId),
        eq(assistantToolReceiptTable.toolCallId, toolCallId),
      ),
    }),
  async finish(id, result) {
    await db
      .update(assistantToolReceiptTable)
      .set(result)
      .where(eq(assistantToolReceiptTable.id, id));
  },
};

type RuntimeTool<Definition extends GrowthCatalog[string]> = Omit<
  Definition,
  "execute" | "outputSchema"
> & {
  outputSchema: Definition["resultSchema"];
  execute: (
    input: z.infer<Definition["validationSchema"]>,
    options: ToolExecutionOptions<GrowthExecutionContext>,
  ) => Promise<z.infer<Definition["resultSchema"]> | GrowthCapabilityError>;
};
export type RuntimeTools<Tools extends GrowthCatalog> = {
  [Name in keyof Tools]: RuntimeTool<NonNullable<Tools[Name]>>;
};

function wrapGrowthTool<Input, Output>(
  name: string,
  definition: GrowthCatalog[string] & {
    validationSchema: z.ZodType<Input>;
    resultSchema: z.ZodType<Output>;
  },
  beforeExecute?: (name: string, value: unknown) => Promise<void>,
) {
  return {
    ...definition,
    inputSchema: definition.inputSchema,
    outputSchema: definition.resultSchema,
    execute: async (
      value: Input,
      options: ToolExecutionOptions<GrowthExecutionContext>,
    ) => {
      await beforeExecute?.(name, value);
      return executeReceipt({
        name,
        value,
        toolCallId: options.toolCallId,
        context: options.context,
        policy: policyForGrowthTool(name, value),
        resultSchema: definition.resultSchema,
        assertAccess: assertOrganizationAccess,
        receipts,
        execute: async () => definition.runValidated(value, options.context),
      });
    },
  };
}

/** Add receipts, output contracts, compact errors, and live access to native tools. */
export function withGrowthExecution<const Tools extends GrowthCatalog>(
  tools: Tools,
  beforeExecute?: (name: string, value: unknown) => Promise<void>,
): RuntimeTools<Tools> {
  // Object.fromEntries cannot retain keys. Every value is produced by the
  // typed wrapper; this assertion reconstructs keys, not input/output types.
  return Object.fromEntries(
    Object.entries(tools).map(([name, definition]) => [
      name,
      wrapGrowthTool(name, definition, beforeExecute),
    ]),
  ) as RuntimeTools<Tools>;
}

export function buildGrowthToolRuntime<
  const Tools extends GrowthCatalog,
>(input: {
  tools: Tools;
  identity: GrowthRuntimeIdentity;
  runId: string;
  surface: GrowthExecutionContext["surface"];
  beforeExecute?: (name: string, value: unknown) => Promise<void>;
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
