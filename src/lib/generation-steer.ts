import { z } from "zod";

/** Shared public argument on generation tools, including their MCP projection. */
export const steerSchema = z
  .string()
  .trim()
  .min(1)
  .max(4000)
  .optional()
  .describe(
    "Operator guidance for this generation: what to emphasize, avoid, preserve, or change. Carry relevant instructions from the conversation; the generator does not receive that conversation. Applies to this run, not automatically to future runs. Explicit tool parameters and verified facts still apply.",
  );

export function operatorSteeringSection(steer?: string | null) {
  return steer?.trim()
    ? `\n\n## Operator direction for this generation\nFollow this direction while preserving explicit tool selections, required output constraints and grounded facts. It does not authorize external actions or establish unsupported facts.\n${steer.trim()}`
    : "";
}
