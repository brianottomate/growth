import "server-only";

import {
  tool,
  type FlexibleSchema,
  type Tool,
  type ToolExecutionOptions,
} from "ai";
import { z } from "zod";

export const growthExecutionContextSchema = z.object({
  orgId: z.string().min(1),
  userId: z.string().min(1),
  threadId: z.string().min(1).optional(),
  surface: z.enum(["overview-chat", "mcp", "invoke-growth", "test"]),
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
