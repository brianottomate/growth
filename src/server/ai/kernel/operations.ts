import "server-only";
import {
  isToolUIPart,
  getToolName,
  type UIMessage,
  type FlexibleSchema,
  type ToolExecutionOptions,
} from "ai";
import { z } from "zod";
import {
  growthTool,
  growthDomainTool,
  type GrowthTool,
  type ActionInput,
  type ActionOutput,
} from "./tool";
import { policyForGrowthTool, type GrowthSurface } from "./policy";
import {
  BACKGROUND_OPERATIONS,
  type BackgroundOperationName,
  jobStartedDataSchema,
  startOperationJob,
} from "./operation-jobs";

/** A heterogeneous catalog is dispatched only through validated input. */
export interface GrowthToolDefinition {
  type: "function";
  description: string;
  inputSchema: FlexibleSchema<unknown>;
  contextSchema: typeof import("./tool").growthExecutionContextSchema;
  // Native execution validates its input; dynamic dispatch uses runValidated.
  execute(
    input: unknown,
    options: ToolExecutionOptions<import("./tool").GrowthExecutionContext>,
  ): Promise<unknown>;
  runValidated: (
    input: unknown,
    context: import("./tool").GrowthExecutionContext,
  ) => Promise<unknown>;
  validationSchema: z.ZodType;
  transportInputSchema: z.ZodType;
  resultSchema: z.ZodType;
  actions?: Record<string, import("./tool").GrowthActionDefinition>;
}
export type GrowthCatalog = Record<string, GrowthToolDefinition>;
type OperationResult<Name, Action> = {
  ok: true;
  action: Name;
  data: ActionOutput<Action>;
};
type FlattenDomain<Name extends string, Actions> = {
  [Action in keyof Actions & string as `${Name}__${Action}`]?: GrowthTool<
    ActionInput<Actions[Action]>,
    `${Name}__${Action}` extends BackgroundOperationName
      ? { ok: true; action: Action; data: z.infer<typeof jobStartedDataSchema> }
      : OperationResult<Action, Actions[Action]>
  >;
};
type UnionToIntersection<Union> = (
  Union extends unknown ? (value: Union) => void : never
) extends (value: infer Intersection) => void
  ? Intersection
  : never;
export type OperationTools<Catalog extends GrowthCatalog> = UnionToIntersection<
  {
    [Name in keyof Catalog & string]: Catalog[Name] extends {
      actions: infer Actions;
    }
      ? FlattenDomain<Name, Actions>
      : Partial<Record<Name, Catalog[Name]>>;
  }[keyof Catalog & string]
>;

/** Each operation advertises its own required fields while sharing domain execution. */
export function operationTools<const Catalog extends GrowthCatalog>(
  catalog: Catalog,
  surface: GrowthSurface,
): OperationTools<Catalog> {
  const operations: GrowthCatalog = {};
  for (const [name, parent] of Object.entries(catalog)) {
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
        execute: async (input, context) => ({
          ok: true as const,
          action,
          data: await spec.runValidated(input, context),
        }),
      });
      operations[key] = BACKGROUND_OPERATIONS.has(key)
        ? growthTool({
            description: `${operation.description} Starts a background job; returns runId. Read operationRead__status on a later turn for the result.`,
            inputSchema: schema,
            resultSchema: z.object({
              ok: z.literal(true),
              action: z.literal(action),
              data: jobStartedDataSchema,
            }),
            execute: async (input, context) => ({
              ok: true as const,
              action,
              data: await startOperationJob(key, operation, input, context),
            }),
          })
        : operation;
    }
  }
  // Object.entries loses literal keys; construction above follows the mapped
  // key/input/output relationship. Surface filtering makes every key optional.
  return operations as OperationTools<Catalog>;
}

/** Retain only actions awaiting approval in saved pre-cutover conversations. */
export function legacyApprovalTools(
  catalog: GrowthCatalog,
  message: UIMessage,
): GrowthCatalog {
  const tools: GrowthCatalog = {};
  if (message.role !== "assistant") return tools;
  for (const part of message.parts) {
    if (!isToolUIPart(part) || part.state !== "approval-responded") continue;
    const name = getToolName(part);
    if (name.includes("__")) continue;
    const parent = catalog[name];
    const input = part.input as { action?: unknown } | undefined;
    if (!parent || typeof input?.action !== "string") continue;
    const spec = parent.actions?.[input.action];
    if (!spec) continue;
    const existing = tools[name];
    tools[name] = growthDomainTool({
      description:
        "Continue an action approved in a saved conversation. Use individual operations for new work.",
      actions: { ...existing?.actions, [input.action]: spec },
    });
  }
  return tools;
}
