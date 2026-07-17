import "server-only";

import { jsonSchema } from "ai";
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

type SerializedVariant = {
  properties?: Record<string, Record<string, unknown>>;
  required?: string[];
};

/**
 * Make an action-discriminated union usable as a tool input schema. Anthropic
 * rejects tool schemas without a top-level `type: "object"` AND any use of
 * anyOf/oneOf/allOf at the top level, so a union can't ship as-is. Instead,
 * serialize to one flat object: an `action` enum whose description carries
 * each variant's summary and required fields, plus the merged (optional)
 * per-action properties. The discriminated union remains the runtime
 * validator, so per-action requirements are still strictly enforced.
 */
export function actionUnionInputSchema<Input>(union: z.ZodType<Input>) {
  const serialized = z.toJSONSchema(union) as {
    anyOf?: SerializedVariant[];
    oneOf?: SerializedVariant[];
  };
  const variants = serialized.oneOf ?? serialized.anyOf ?? [];
  if (!variants.length) {
    throw new Error("actionUnionInputSchema expects a union of objects");
  }

  const actionNames: string[] = [];
  const actionSummaries: string[] = [];
  const mergedProperties: Record<string, Record<string, unknown>> = {};
  for (const variant of variants) {
    const properties = variant.properties ?? {};
    const actionProperty = properties.action ?? {};
    const actionName =
      (actionProperty.const as string | undefined) ??
      (actionProperty.enum as string[] | undefined)?.[0];
    if (typeof actionName !== "string") {
      throw new Error("Every union variant needs an `action` literal");
    }
    actionNames.push(actionName);
    const requiredFields = (variant.required ?? []).filter(
      (field) => field !== "action",
    );
    const summaryParts = [
      actionName,
      requiredFields.length ? `(requires ${requiredFields.join(", ")})` : "",
      typeof actionProperty.description === "string"
        ? `— ${actionProperty.description}`
        : "",
    ].filter(Boolean);
    actionSummaries.push(summaryParts.join(" "));
    for (const [field, fieldSchema] of Object.entries(properties)) {
      if (field === "action" || field in mergedProperties) continue;
      mergedProperties[field] = fieldSchema;
    }
  }

  const flattened = {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: actionNames,
        description: `One of: ${actionSummaries.join(" | ")}`,
      },
      ...mergedProperties,
    },
    required: ["action"],
    additionalProperties: false,
  } as unknown as Parameters<typeof jsonSchema>[0];

  return jsonSchema<Input>(flattened, {
    validate: (value) => {
      const parsed = union.safeParse(value);
      return parsed.success
        ? { success: true, value: parsed.data }
        : { success: false, error: parsed.error };
    },
  });
}

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

  const unionSchema = z.discriminatedUnion(
    "action",
    variants as unknown as [z.ZodObject, z.ZodObject, ...z.ZodObject[]],
  );
  const inputSchema = actionUnionInputSchema(
    unionSchema as unknown as z.ZodType<GroupInput<Tools>>,
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
