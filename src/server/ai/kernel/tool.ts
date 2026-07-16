import "server-only";

import { tool, type Tool, type ToolExecutionOptions } from "ai";
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
};

/**
 * Thin AI SDK tool helper: the returned value is a native Tool. The helper only
 * turns AI SDK 7's execution options into Growth's typed request context.
 * Names, policy, exposure, and surface composition live in ordinary maps.
 */
export function growthTool<I extends z.ZodTypeAny, O>(definition: {
  description: string;
  inputSchema: I;
  execute: (input: z.infer<I>, ctx: GrowthExecutionContext) => Promise<O>;
}): GrowthTool<z.infer<I>, O> {
  const nativeTool = tool({
    description: definition.description,
    inputSchema: definition.inputSchema,
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
  });
}
