import "server-only";

import {
  jsonSchema,
  type FlexibleSchema,
  type Tool,
  type ToolExecutionOptions,
} from "ai";
import { z } from "zod";

import { capabilityErrorSchema } from "./output";

export const growthExecutionContextSchema = z.object({
  orgId: z.string(),
  userId: z.string(),
  threadId: z.string().optional(),
  surface: z.enum(["overview-chat", "mcp", "invoke-growth", "test"]),
  runId: z.string(),
});
export type GrowthExecutionContext = z.infer<
  typeof growthExecutionContextSchema
>;

/** Actions also run from the app, which is not a tool surface. */
export type GrowthActionContext = Omit<GrowthExecutionContext, "surface"> & {
  surface: GrowthExecutionContext["surface"] | "app";
};

export type GrowthCapabilityError = z.infer<typeof capabilityErrorSchema>;

/** Executable function tool; avoids the SDK's conditional optional-execute type.
 * Concrete catalogs still satisfy ToolSet, so SDK compatibility is checked there. */
export type GrowthTool<INPUT = unknown, OUTPUT = unknown> = {
  type: "function";
  description: string;
  inputSchema: FlexibleSchema<INPUT>;
  contextSchema: typeof growthExecutionContextSchema;
  providerOptions?: Tool<
    INPUT,
    OUTPUT,
    GrowthExecutionContext
  >["providerOptions"];
  execute: (
    input: INPUT,
    options: ToolExecutionOptions<GrowthExecutionContext>,
  ) => Promise<OUTPUT>;

  /** Compose product logic without manufacturing AI SDK execution options. */
  run: (input: INPUT, context: GrowthExecutionContext) => Promise<OUTPUT>;
  runValidated: (
    input: unknown,
    context: GrowthExecutionContext,
  ) => Promise<OUTPUT>;
  /** Strict application contract used after a transport produces tool input. */
  validationSchema: z.ZodType<INPUT>;
  /** Provider-safe schema advertised by transports such as the OAuth MCP. */
  transportInputSchema: z.ZodType<unknown>;
  resultSchema: z.ZodType<GrowthWireOutput<OUTPUT> | GrowthCapabilityError>;
  /**
   * The actions this capability was compiled from, for anything that needs to
   * see the definitions rather than the flattened result: the contract gate,
   * and any inspector that wants to print what a surface actually advertises.
   */
  actions?: Record<string, GrowthActionDefinition>;
};

/** JSON representation of a service result at the model/MCP boundary. */
export type GrowthWireOutput<T> = unknown extends T
  ? unknown
  : T extends Date
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

/** Metadata and validated dispatch shared by heterogeneous actions. */
export interface GrowthActionDefinition {
  description: string;
  inputSchema: z.ZodObject;
  outputSchema: z.ZodType;
  examples?: readonly unknown[];
  runValidated: (
    input: unknown,
    context: GrowthActionContext,
  ) => Promise<unknown>;
}

/** A typed service action. It is deliberately not an AI SDK tool. */
export interface GrowthAction<
  INPUT = unknown,
  OUTPUT = unknown,
  SCHEMA extends z.ZodObject = z.ZodObject,
> {
  description: string;
  inputSchema: SCHEMA;
  /**
   * What the action promises to return, when it makes one.
   *
   * Required wire contract: dates have already become ISO strings and undefined
   * object fields have been omitted. Advertised through MCP and checked by the
   * contract gate and validated by the runtime for fresh and replayed results.
   */
  outputSchema: z.ZodType<GrowthWireOutput<OUTPUT>>;
  /**
   * Calls that must stay valid, checked by `bun run ai:contracts`.
   *
   * These are a contract test rather than prompt material: they catch the case
   * where a schema tightens and the guidance in the description quietly starts
   * describing a call the action would now refuse.
   */
  examples?: readonly unknown[];
  run: (input: INPUT, context: GrowthActionContext) => Promise<OUTPUT>;
  /** Dynamic dispatch validates external input before calling the typed action. */
  runValidated: (
    input: unknown,
    context: GrowthActionContext,
  ) => Promise<OUTPUT>;
}

/** JSON-compatible actions derive their implementation result from the schema. */
export function growthAction<
  I extends z.ZodObject,
  S extends z.ZodType,
>(definition: {
  description: string;
  inputSchema: I;
  outputSchema: S;
  examples?: readonly z.input<I>[];
  execute: (
    input: z.infer<I>,
    ctx: GrowthActionContext,
  ) => Promise<NoInfer<z.output<S>>>;
}): GrowthAction<z.infer<I>, z.output<S>, I>;

/** Native services keep Dates; their separately declared wire projection is checked too. */
export function growthAction<
  I extends z.ZodObject,
  S extends z.ZodType,
>(definition: {
  description: string;
  inputSchema: I;
  nativeOutputSchema: S;
  outputSchema: z.ZodType<NoInfer<GrowthWireOutput<z.output<S>>>>;
  examples?: readonly z.input<I>[];
  execute: (
    input: z.infer<I>,
    ctx: GrowthActionContext,
  ) => Promise<NoInfer<z.output<S>>>;
}): GrowthAction<z.infer<I>, z.output<S>, I>;

export function growthAction<I extends z.ZodObject, O>(definition: {
  description: string;
  inputSchema: I;
  nativeOutputSchema?: z.ZodType<O>;
  outputSchema: z.ZodType<GrowthWireOutput<O>>;
  examples?: readonly z.input<I>[];
  execute: (input: z.infer<I>, ctx: GrowthActionContext) => Promise<O>;
}): GrowthAction<z.infer<I>, O, I> {
  return {
    description: definition.description,
    inputSchema: definition.inputSchema,
    outputSchema: definition.outputSchema,
    ...(definition.examples ? { examples: definition.examples } : {}),
    run: definition.execute,
    runValidated: (input, context) =>
      definition.execute(definition.inputSchema.parse(input), context),
  };
}

export type ActionOutput<Action> = Action extends {
  runValidated: (...args: never[]) => Promise<infer Output>;
}
  ? Output
  : never;
export type ActionInput<Action> = Action extends {
  inputSchema: infer Schema extends z.ZodType;
}
  ? z.infer<Schema>
  : never;
type WithAction<Input, Name> =
  Input extends Record<string, never>
    ? { action: Name }
    : Omit<Input, "action"> & { action: Name };
type DomainInput<Actions extends Record<string, GrowthActionDefinition>> = {
  [Name in keyof Actions]: WithAction<ActionInput<Actions[Name]>, Name>;
}[keyof Actions];
type DomainOutput<Actions extends Record<string, GrowthActionDefinition>> = {
  [Name in keyof Actions]: {
    ok: true;
    action: Name;
    data: ActionOutput<Actions[Name]>;
  };
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
  const Actions extends Record<string, GrowthActionDefinition>,
>(definition: {
  description: string;
  actions: Actions;
}): Omit<GrowthTool<DomainInput<Actions>, DomainOutput<Actions>>, "actions"> & {
  actions: Actions;
} {
  const variants = Object.entries(definition.actions).map(([action, spec]) => {
    return spec.inputSchema.extend({
      action: z.literal(action).describe(spec.description),
    });
  });
  const [first, ...remaining] = variants;
  if (!first) throw new Error("A Growth domain needs at least one action");
  const validationSchema = z.discriminatedUnion("action", [
    first,
    ...remaining,
  ]) as unknown as z.ZodType<DomainInput<Actions>>;
  const transport = providerRootObjectSchema(validationSchema, variants);
  const resultSchema = z.union(
    Object.entries(definition.actions).map(([action, spec]) =>
      z.object({
        ok: z.literal(true),
        action: z.literal(action),
        data: spec.outputSchema,
      }),
    ),
  ) as unknown as z.ZodType<GrowthWireOutput<DomainOutput<Actions>>>;
  const domain = growthTool({
    description: definition.description,
    inputSchema: validationSchema,
    actions: definition.actions,
    resultSchema,
    ...transport,
    execute: async (input, context) => {
      const { action, ...payload } = input;
      // The discriminator and payload were checked by validationSchema above.
      // Runtime construction cannot retain TS's key/payload correlation.
      return {
        ok: true,
        action,
        data: await definition.actions[action]!.runValidated(payload, context),
      } as DomainOutput<Actions>;
    },
  });
  return { ...domain, actions: definition.actions };
}

/**
 * Thin AI SDK tool helper: the returned value is a native Tool. The helper only
 * turns AI SDK 7's execution options into Growth's typed request context.
 * Names, policy, exposure, and surface composition live in ordinary maps.
 */
export function growthTool<Input, O>(definition: {
  description: string;
  inputSchema: z.ZodType<Input>;
  modelInputSchema?: FlexibleSchema<Input>;
  transportInputSchema?: z.ZodType<unknown>;
  resultSchema: z.ZodType<NoInfer<GrowthWireOutput<O>>>;
  actions?: Record<string, GrowthActionDefinition>;
  execute: (input: Input, ctx: GrowthExecutionContext) => Promise<O>;
}): GrowthTool<Input, O> {
  const resultSchema = z.union([
    definition.resultSchema,
    capabilityErrorSchema,
  ]);
  const run = definition.execute;
  return {
    type: "function",
    description: definition.description,
    inputSchema: definition.modelInputSchema ?? definition.inputSchema,
    contextSchema: growthExecutionContextSchema,
    execute: (input, options) =>
      run(definition.inputSchema.parse(input), options.context),
    run,
    runValidated: (input, context) =>
      run(definition.inputSchema.parse(input), context),
    validationSchema: definition.inputSchema,
    transportInputSchema:
      definition.transportInputSchema ?? definition.inputSchema,
    resultSchema,
    ...(definition.actions ? { actions: definition.actions } : {}),
  };
}
