import { fromJsonSchema } from "@modelcontextprotocol/server";
import { z } from "zod";

export { capabilityErrorSchema } from "@/server/ai/kernel/output";

// Stateless MCP requests create fresh servers, while immutable Zod contracts
// are shared. Compile each contract once per process rather than on every call.
const compiledOutputs = new WeakMap<
  z.ZodType,
  ReturnType<typeof fromJsonSchema>
>();

export function mcpOutputSchema(schema: z.ZodType) {
  const cached = compiledOutputs.get(schema);
  if (cached) return cached;
  const compiled = fromJsonSchema({
    ...z.toJSONSchema(schema, { target: "draft-7", reused: "ref" }),
    type: "object",
  } as Parameters<typeof fromJsonSchema>[0]);
  compiledOutputs.set(schema, compiled);
  return compiled;
}
