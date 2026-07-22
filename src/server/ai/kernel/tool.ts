import "server-only";

import {
  jsonSchema,
  tool,
  type FlexibleSchema,
  type Tool,
  type ToolExecutionOptions,
} from "ai";
import { z } from "zod";

import { compactGrowthError, type GrowthErrorCode } from "./errors";

export const growthExecutionContextSchema = z.object({
  orgId: z.string().min(1),
  userId: z.string().min(1),
  threadId: z.string().min(1).optional(),
  surface: z.enum([
    "overview-chat",
    "plan-chat",
    "mcp",
    "invoke-growth",
    "test",
  ]),
  runId: z.string().min(1),
});

export type GrowthExecutionContext = z.infer<
  typeof growthExecutionContextSchema
>;

export type GrowthTool<INPUT = unknown, OUTPUT = unknown> = Tool<
  INPUT,
  OUTPUT,
  GrowthExecutionContext
> & {
  /** Compose product logic without manufacturing AI SDK execution options. */
  run: (input: INPUT, context: GrowthExecutionContext) => Promise<OUTPUT>;
  /** Strict application contract used after a transport produces tool input. */
  validationSchema: z.ZodType<INPUT>;
  /** Provider-safe schema advertised by transports such as the OAuth MCP. */
  transportInputSchema: z.ZodType<unknown>;
};

/** A typed service action. It is deliberately not an AI SDK tool. */
export interface GrowthAction<INPUT = unknown, OUTPUT = unknown> {
  description: string;
  inputSchema: z.ZodTypeAny;
  run: (input: INPUT, context: GrowthExecutionContext) => Promise<OUTPUT>;
}

export function growthAction<I extends z.ZodTypeAny, O>(definition: {
  description: string;
  inputSchema: I;
  execute: (input: z.infer<I>, ctx: GrowthExecutionContext) => Promise<O>;
}): GrowthAction<z.infer<I>, O> {
  return {
    description: definition.description,
    inputSchema: definition.inputSchema,
    run: definition.execute,
  };
}

type ActionInput<Action> =
  Action extends GrowthAction<infer Input, unknown> ? Input : never;
type WithAction<Input, Name> =
  Input extends Record<string, never>
    ? { action: Name }
    : Omit<Input, "action"> & { action: Name };
type DomainInput<Actions extends Record<string, GrowthAction<never, unknown>>> =
  {
    [Name in keyof Actions]: WithAction<ActionInput<Actions[Name]>, Name>;
  }[keyof Actions];
function providerRootObjectSchema<Input>(
  validationSchema: z.ZodType<Input>,
  variants: z.ZodObject[],
) {
  const actions = variants.flatMap((variant) => {
    const action = z.toJSONSchema(variant.shape.action) as {
      const?: unknown;
      enum?: unknown[];
    };
    const values =
      typeof action.const === "string"
        ? [action.const]
        : (action.enum ?? []).filter(
            (value): value is string => typeof value === "string",
          );
    if (values.length === 0)
      throw new Error("Every domain action must use z.literal()");
    return values;
  });
  const fields = new Map<string, z.ZodTypeAny[]>();
  for (const variant of variants) {
    const variantShape: Record<string, z.ZodTypeAny> = variant.shape;
    for (const [name, schema] of Object.entries(variantShape)) {
      if (name === "action") continue;
      fields.set(name, [...(fields.get(name) ?? []), schema]);
    }
  }
  const shape: Record<string, z.ZodTypeAny> = {
    action: z.enum(actions as [string, ...string[]]),
  };
  for (const [name, schemas] of fields) {
    const unique = [
      ...new Map(
        schemas.map((schema) => [
          JSON.stringify(z.toJSONSchema(schema)),
          schema,
        ]),
      ).values(),
    ];
    shape[name] = (
      unique.length === 1
        ? unique[0]!
        : z.union(unique as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]])
    ).optional();
  }
  const transportInputSchema = z.object(shape).strict();
  const { $schema: _, ...providerSchema } = z.toJSONSchema(
    transportInputSchema,
  ) as Record<string, unknown>;
  return {
    transportInputSchema,
    modelInputSchema: jsonSchema<Input>(providerSchema, {
      validate: (value) => {
        const parsed = validationSchema.safeParse(value);
        return parsed.success
          ? { success: true, value: parsed.data }
          : { success: false, error: parsed.error };
      },
    }),
  };
}

export function actionUnionTransportSchemas<Input>(
  validationSchema: z.ZodType<Input>,
) {
  if (!(validationSchema instanceof z.ZodDiscriminatedUnion))
    throw new Error("Expected an action-discriminated union");
  return providerRootObjectSchema<Input>(
    validationSchema as unknown as z.ZodType<Input>,
    validationSchema.options as z.ZodObject[],
  );
}

/** Construct one direct native AI SDK capability from plain service actions. */
export function growthDomainTool<
  const Actions extends Record<string, GrowthAction<never, unknown>>,
>(definition: {
  description: string;
  actions: Actions;
}): GrowthTool<
  DomainInput<Actions>,
  | { ok: true; action: keyof Actions; data: unknown }
  | {
      ok: false;
      action: keyof Actions;
      error: {
        code: GrowthErrorCode;
        message: string;
        retryable: boolean;
        suggestedAction: string;
      };
    }
> {
  const variants = Object.entries(definition.actions).map(([action, spec]) => {
    if (!(spec.inputSchema instanceof z.ZodObject))
      throw new Error(`Growth domain action ${action} must use z.object()`);
    return spec.inputSchema.extend({
      action: z.literal(action).describe(spec.description),
    });
  });
  if (variants.length === 0)
    throw new Error("A Growth domain needs at least one action");
  const validationSchema = z.discriminatedUnion(
    "action",
    variants as unknown as [z.ZodObject, z.ZodObject, ...z.ZodObject[]],
  ) as unknown as z.ZodType<DomainInput<Actions>>;
  const transport = providerRootObjectSchema(validationSchema, variants);
  return growthTool({
    description: definition.description,
    inputSchema: validationSchema,
    ...transport,
    execute: async (input, context) => {
      const action = String(input.action);
      const spec = definition.actions[action];
      if (!spec) throw new Error(`Unknown Growth domain action: ${action}`);
      const { action: _, ...payload } = input;
      const executable = spec as unknown as GrowthAction<
        typeof payload,
        unknown
      >;
      const data = await executable.run(payload, context);
      if (
        typeof data === "object" &&
        data !== null &&
        "error" in data &&
        typeof data.error === "string"
      ) {
        const error = compactGrowthError(data.error);
        return {
          ok: false as const,
          action: input.action,
          error: {
            code: error.code,
            message: error.error,
            retryable: error.retryable,
            suggestedAction: error.suggestedAction,
          },
        };
      }
      return { ok: true as const, action: input.action, data };
    },
  });
}

/**
 * Thin AI SDK tool helper: the returned value is a native Tool. The helper only
 * turns AI SDK 7's execution options into Growth's typed request context.
 * Names, policy, exposure, and surface composition live in ordinary maps.
 */
export function growthTool<I extends z.ZodTypeAny, O>(definition: {
  description: string;
  inputSchema: I;
  modelInputSchema?: FlexibleSchema<z.infer<I>>;
  transportInputSchema?: z.ZodType<unknown>;
  execute: (input: z.infer<I>, ctx: GrowthExecutionContext) => Promise<O>;
}): GrowthTool<z.infer<I>, O> {
  const nativeTool = tool({
    description: definition.description,
    inputSchema: definition.modelInputSchema ?? definition.inputSchema,
    contextSchema: growthExecutionContextSchema,
    execute: (
      input: z.infer<I>,
      options: ToolExecutionOptions<GrowthExecutionContext>,
    ) =>
      definition.execute(
        input,
        growthExecutionContextSchema.parse(options.context),
      ),
  } as unknown as Tool<z.infer<I>, O, GrowthExecutionContext>);
  return Object.assign(nativeTool, {
    run: definition.execute,
    validationSchema: definition.inputSchema,
    transportInputSchema:
      definition.transportInputSchema ?? definition.inputSchema,
  }) as unknown as GrowthTool<z.infer<I>, O>;
}
