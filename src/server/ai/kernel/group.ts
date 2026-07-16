import "server-only";

import { z } from "zod";

import { growthTool, type GrowthTool } from "./tool";

type InputOf<ToolDefinition> =
  ToolDefinition extends GrowthTool<infer Input, infer _Output> ? Input : never;
type OutputOf<ToolDefinition> =
  ToolDefinition extends GrowthTool<infer _Input, infer Output>
    ? Output
    : never;

type OnlyGrowthTools<Tools extends Record<string, unknown>> = {
  [Name in keyof Tools]: Tools[Name] extends GrowthTool<
    infer _Input,
    infer _Output
  >
    ? Tools[Name]
    : never;
};

type WithAction<Input, Name> =
  Input extends Record<string, never>
    ? { action: Name }
    : Omit<Input, "action"> & { action: Name };

type GroupInput<Tools extends Record<string, unknown>> = {
  [Name in keyof Tools]: WithAction<InputOf<Tools[Name]>, Name>;
}[keyof Tools];

type GroupOutput<Tools extends Record<string, unknown>> = {
  [Name in keyof Tools]: OutputOf<Tools[Name]>;
}[keyof Tools];

/**
 * Collapse related native tools into one action-discriminated capability.
 * Each action keeps the original Zod fields and delegates through `.run`, so
 * domain logic stays independently composable without adding nested receipts.
 */
export function groupGrowthTools<
  const Tools extends Record<string, unknown>,
>(input: {
  description: string;
  actions: Tools & OnlyGrowthTools<Tools>;
}): GrowthTool<GroupInput<Tools>, GroupOutput<Tools>> {
  const variants = Object.entries(input.actions).map(([action, value]) => {
    const definition = value as GrowthTool<unknown, unknown>;
    const actionInputSchema = definition.inputSchema as unknown;
    if (!(actionInputSchema instanceof z.ZodObject)) {
      throw new Error(`Grouped Growth action ${action} must use z.object()`);
    }
    return actionInputSchema.extend({
      action: z
        .literal(action)
        .describe(
          typeof definition.description === "string"
            ? definition.description
            : `Run ${action}`,
        ),
    });
  });
  if (variants.length < 2) {
    throw new Error("A grouped Growth capability needs at least two actions");
  }

  const inputSchema = z.discriminatedUnion(
    "action",
    variants as unknown as [z.ZodObject, z.ZodObject, ...z.ZodObject[]],
  );
  return growthTool({
    description: input.description,
    inputSchema: inputSchema as unknown as z.ZodType<GroupInput<Tools>>,
    execute: async (value, context) => {
      const action = String(value.action);
      const selected = input.actions[action];
      if (!selected) throw new Error(`Unknown grouped action: ${action}`);
      const definition = selected as GrowthTool<unknown, GroupOutput<Tools>>;
      const { action: _, ...payload } = value as GroupInput<Tools> & {
        action: string;
      };
      return definition.run(payload, context);
    },
  });
}
