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
import { capabilityErrorSchema } from "./output";

export type GrowthExecutionContext = {
  orgId: string;
  userId: string;
  threadId?: string;
  surface: "overview-chat" | "mcp" | "invoke-growth" | "test";
  runId: string;
};

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
  resultSchema: z.ZodTypeAny;
  /**
   * The actions this capability was compiled from, for anything that needs to
   * see the definitions rather than the flattened result: the contract gate,
   * and any inspector that wants to print what a surface actually advertises.
   */
  actions?: Record<string, GrowthAction<never, unknown>>;
};

/** JSON representation of a service result at the model/MCP boundary. */
export type GrowthWireOutput<T> = T extends Date
  ? string
  : T extends readonly (infer Item)[]
    ? GrowthWireOutput<Item>[]
    : T extends object
      ? {
          [
            Key in keyof T as undefined extends T[Key] ? never : Key
          ]: GrowthWireOutput<T[Key]>;
        } & {
          [
            Key in keyof T as undefined extends T[Key] ? Key : never
          ]?: GrowthWireOutput<Exclude<T[Key], undefined>>;
        }
      : T;

/** A typed service action. It is deliberately not an AI SDK tool. */
export interface GrowthAction<INPUT = unknown, OUTPUT = unknown> {
  description: string;
  inputSchema: z.ZodObject;
  /**
   * What the action promises to return, when it makes one.
   *
   * Required wire contract: dates have already become ISO strings and undefined
   * object fields have been omitted. Advertised through MCP and checked by the
   * contract gate; trusted service results are not revalidated during execution.
   */
  outputSchema: z.ZodTypeAny;
  /**
   * Calls that must stay valid, checked by `bun run ai:contracts`.
   *
   * These are a contract test rather than prompt material: they catch the case
   * where a schema tightens and the guidance in the description quietly starts
   * describing a call the action would now refuse.
   */
  examples?: readonly unknown[];
  run: (input: INPUT, context: GrowthExecutionContext) => Promise<OUTPUT>;
}

export function growthAction<I extends z.ZodObject, O>(definition: {
  description: string;
  inputSchema: I;
  outputSchema: z.ZodType<NoInfer<GrowthWireOutput<O>>>;
  examples?: readonly z.input<I>[];
  execute: (input: z.infer<I>, ctx: GrowthExecutionContext) => Promise<O>;
}): GrowthAction<z.infer<I>, O> {
  return {
    description: definition.description,
    inputSchema: definition.inputSchema,
    outputSchema: definition.outputSchema,
    ...(definition.examples ? { examples: definition.examples } : {}),
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
  const fields = new Map<string, z.ZodTypeAny[]>();
  for (const variant of variants) {
    const variantShape: Record<string, z.ZodTypeAny> = variant.shape;
    for (const [name, schema] of Object.entries(variantShape)) {
      if (name === "action") continue;
      fields.set(name, [...(fields.get(name) ?? []), schema]);
    }
  }
  // The action literals carry each action's description. A bare
  // `z.enum(actions)` drops every one of them, which leaves the model
  // choosing between names — and the guidance that says which action is the
  // local draft and which one writes to the provider never reaches it.
  const describedActions = variants.map((variant) => {
    const shape_: Record<string, z.ZodTypeAny> = variant.shape;
    const literal = shape_.action!;
    const required = Object.entries(shape_)
      .filter(
        ([name, schema]) =>
          name !== "action" && !schema.safeParse(undefined).success,
      )
      .map(([name]) => name);
    if (required.length === 0) return literal;
    const described = literal.description ?? "";
    return literal.describe(
      `${described}${described ? " " : ""}Requires: ${required.join(", ")}.`,
    );
  });
  const shape: Record<string, z.ZodTypeAny> = {
    action:
      describedActions.length === 1
        ? describedActions[0]!
        : z.union(
            describedActions as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]],
          ),
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
        suggestedAction: string;
      };
    }
> {
  const variants = Object.entries(definition.actions).map(([action, spec]) => {
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
    actions: definition.actions,
    resultSchema: z.union([
      ...Object.entries(definition.actions).map(([action, spec]) =>
        z.object({
          ok: z.literal(true),
          action: z.literal(action),
          data: spec.outputSchema,
        }),
      ),
    ] as unknown as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]),
    ...transport,
    execute: async (input, context) => {
      const { action, ...payload } = input;
      return runGrowthAction(
        action,
        definition.actions[action] as unknown as GrowthAction<
          typeof payload,
          unknown
        >,
        payload,
        context,
      );
    },
  });
}

/** Domain and individual tools share the same result envelope. */
export async function runGrowthAction<Name extends PropertyKey, Input, Output>(
  action: Name,
  spec: GrowthAction<Input, Output>,
  input: Input,
  context: GrowthExecutionContext,
) {
  const data = await spec.run(input, context);
  // Older services return an error object; preserve that public failure contract.
  if (
    typeof data === "object" &&
    data !== null &&
    "error" in data &&
    typeof data.error === "string"
  ) {
    const error = compactGrowthError(data.error);
    return {
      ok: false as const,
      action,
      error: {
        code: error.code,
        message: error.error,
        suggestedAction: error.suggestedAction,
      },
    };
  }
  return { ok: true as const, action, data };
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
  resultSchema: z.ZodTypeAny;
  actions?: Record<string, GrowthAction<never, unknown>>;
  execute: (input: z.infer<I>, ctx: GrowthExecutionContext) => Promise<O>;
}): GrowthTool<z.infer<I>, O> {
  const resultSchema = z.union([
    definition.resultSchema,
    capabilityErrorSchema,
  ]);
  const run = definition.execute;
  const nativeTool = tool({
    description: definition.description,
    inputSchema: definition.modelInputSchema ?? definition.inputSchema,
    execute: (
      input: z.infer<I>,
      options: ToolExecutionOptions<GrowthExecutionContext>,
    ) => run(input, options.context),
  } as unknown as Tool<z.infer<I>, O, GrowthExecutionContext>);
  return Object.assign(nativeTool, {
    run,
    validationSchema: definition.inputSchema,
    transportInputSchema:
      definition.transportInputSchema ?? definition.inputSchema,
    resultSchema,
    ...(definition.actions ? { actions: definition.actions } : {}),
  }) as unknown as GrowthTool<z.infer<I>, O>;
}
