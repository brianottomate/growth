import "server-only";

import { jsonSchema, type FlexibleSchema } from "ai";
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

type ActionObject = z.ZodObject<z.ZodRawShape>;

function actionValues(schema: z.ZodTypeAny) {
  const serialized = z.toJSONSchema(schema) as {
    const?: unknown;
    enum?: unknown[];
  };
  const values =
    typeof serialized.const === "string"
      ? [serialized.const]
      : (serialized.enum ?? []).filter(
          (value): value is string => typeof value === "string",
        );
  if (values.length === 0) {
    throw new Error(
      "Every action-union variant must use a string literal or enum",
    );
  }
  return values;
}

function uniqueSchemas(schemas: z.ZodTypeAny[]) {
  const unique = new Map<string, z.ZodTypeAny>();
  for (const schema of schemas) {
    const key = JSON.stringify(z.toJSONSchema(schema));
    if (!unique.has(key)) unique.set(key, schema);
  }
  return [...unique.values()];
}

/**
 * Build provider and MCP representations of an action-discriminated union.
 *
 * Anthropic requires a top-level object and rejects a root oneOf/anyOf/allOf.
 * The advertised object therefore makes every action field optional and
 * combines fields that differ between actions with nested unions. The original
 * discriminated union remains the strict validator, so action-specific
 * required fields and refinements are still enforced before execution.
 */
export function actionUnionTransportSchemas<Input>(union: z.ZodType<Input>): {
  modelInputSchema: FlexibleSchema<Input>;
  transportInputSchema: ActionObject;
} {
  const validationSchema = union;
  if (!(union instanceof z.ZodDiscriminatedUnion)) {
    throw new Error(
      "actionUnionTransportSchemas expects a discriminated union",
    );
  }

  const variants = union.options as ActionObject[];
  const names: string[] = [];
  const actionGuide: string[] = [];
  const fieldSchemas = new Map<string, z.ZodTypeAny[]>();

  for (const variant of variants) {
    const shape = variant.shape as Record<string, z.ZodTypeAny>;
    const actionSchema = shape.action;
    if (!actionSchema) {
      throw new Error("Every action-union variant needs an `action` field");
    }

    const variantActions = actionValues(actionSchema);
    const serialized = z.toJSONSchema(variant) as {
      properties?: Record<string, unknown>;
      required?: string[];
    };
    const required = new Set(serialized.required ?? []);
    const fields = Object.keys(shape).filter((field) => field !== "action");
    const requiredFields = fields.filter((field) => required.has(field));
    const optionalFields = fields.filter((field) => !required.has(field));
    const fieldGuide = [
      requiredFields.length
        ? `requires ${requiredFields.join(", ")}`
        : "requires no fields",
      optionalFields.length ? `optional ${optionalFields.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("; ");
    const description = actionSchema.description;

    for (const action of variantActions) {
      if (names.includes(action)) {
        throw new Error(`Duplicate action in discriminated union: ${action}`);
      }
      names.push(action);
      actionGuide.push(
        `${action} (${fieldGuide})${description ? ` — ${description}` : ""}`,
      );
    }

    for (const [field, schema] of Object.entries(shape)) {
      if (field === "action") continue;
      const existing = fieldSchemas.get(field) ?? [];
      existing.push(schema);
      fieldSchemas.set(field, existing);
    }
  }

  if (names.length < 2) {
    throw new Error("An action union needs at least two distinct actions");
  }

  const transportShape: Record<string, z.ZodTypeAny> = {
    action: z
      .enum(names as [string, ...string[]])
      .describe(`Choose one action. ${actionGuide.join(" | ")}`),
  };
  for (const [field, schemas] of fieldSchemas) {
    const alternatives = uniqueSchemas(schemas);
    const fieldSchema =
      alternatives.length === 1
        ? alternatives[0]!
        : z.union(
            alternatives as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]],
          );
    transportShape[field] = fieldSchema.optional();
  }

  const transportInputSchema = z.object(transportShape).strict();
  const { $schema: _, ...providerSchema } = z.toJSONSchema(
    transportInputSchema,
  ) as Record<string, unknown>;
  const modelInputSchema = jsonSchema<Input>(providerSchema, {
    validate: (value) => {
      const parsed = validationSchema.safeParse(value);
      return parsed.success
        ? { success: true, value: parsed.data }
        : { success: false, error: parsed.error };
    },
  });

  return { modelInputSchema, transportInputSchema };
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
    const actionInputSchema = definition.validationSchema;
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

  const validationSchema = z.discriminatedUnion(
    "action",
    variants as unknown as [z.ZodObject, z.ZodObject, ...z.ZodObject[]],
  ) as unknown as z.ZodType<GroupInput<Tools>>;
  const { modelInputSchema, transportInputSchema } =
    actionUnionTransportSchemas(validationSchema);

  return growthTool({
    description: input.description,
    inputSchema: validationSchema,
    modelInputSchema,
    transportInputSchema,
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
