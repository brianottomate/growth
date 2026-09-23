import "server-only";
import { isToolUIPart, getToolName, type ToolSet, type UIMessage } from "ai";
import { z } from "zod";
import {
  growthTool,
  growthDomainTool,
  runGrowthAction,
  type GrowthTool,
  type GrowthAction,
} from "./tool";
import { policyForGrowthTool, type GrowthSurface } from "./policy";
import {
  BACKGROUND_OPERATIONS,
  jobStartedDataSchema,
  startOperationJob,
} from "./operation-jobs";

/** Each operation advertises its own required fields while sharing domain execution. */
export function operationTools(
  catalog: ToolSet,
  surface: GrowthSurface,
): Record<string, GrowthTool> {
  const operations: Record<string, GrowthTool> = {};
  for (const [name, definition] of Object.entries(catalog)) {
    const parent = definition as GrowthTool;
    if (!parent.actions) {
      if (policyForGrowthTool(name).surfaces.includes(surface))
        operations[name] = parent;
      continue;
    }
    for (const [action, spec] of Object.entries(parent.actions)) {
      const key = `${name}__${action}`;
      if (!policyForGrowthTool(key).surfaces.includes(surface)) continue;
      const schema = spec.inputSchema;
      const operation = growthTool({
        description: spec.description,
        inputSchema: schema,
        resultSchema: z.object({
          ok: z.literal(true),
          action: z.literal(action),
          data: spec.outputSchema,
        }),
        execute: (input, context) =>
          runGrowthAction(
            action,
            spec as GrowthAction<typeof input, unknown>,
            input,
            context,
          ),
      });
      operations[key] = (BACKGROUND_OPERATIONS.has(key)
        ? growthTool({
            description: `${typeof operation.description === "string" ? operation.description : key} Starts a background job; returns runId. Read operationRead__status on a later turn for the result.`,
            inputSchema: schema,
            resultSchema: z.object({
              ok: z.literal(true),
              action: z.literal(action),
              data: jobStartedDataSchema,
            }),
            execute: async (input, context) => ({
              ok: true as const,
              action,
              data: await startOperationJob(
                key,
                operation as unknown as GrowthTool,
                input,
                context,
              ),
            }),
          })
        : operation) as unknown as GrowthTool;
    }
  }
  return operations;
}

/** Retain only actions awaiting approval in saved pre-cutover conversations. */
export function legacyApprovalTools(
  catalog: ToolSet,
  message: UIMessage,
): ToolSet {
  const tools: ToolSet = {};
  if (message.role !== "assistant") return tools;
  for (const part of message.parts) {
    if (!isToolUIPart(part) || part.state !== "approval-responded") continue;
    const name = getToolName(part);
    if (name.includes("__")) continue;
    const parent = catalog[name] as GrowthTool | undefined;
    const input = part.input as { action?: unknown } | undefined;
    if (!parent || typeof input?.action !== "string") continue;
    const spec = parent.actions?.[input.action];
    if (!spec) continue;
    const existing = tools[name] as GrowthTool | undefined;
    tools[name] = growthDomainTool({
      description:
        "Continue an action approved in a saved conversation. Use individual operations for new work.",
      actions: { ...existing?.actions, [input.action]: spec },
    }) as unknown as GrowthTool;
  }
  return tools;
}
