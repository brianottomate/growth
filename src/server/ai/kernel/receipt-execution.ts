import { z } from "zod";
import { compactGrowthError, GrowthActionError } from "./errors";
import {
  capabilityErrorSchema,
  normalizeGrowthJson,
  type JsonValue,
} from "./output";
import type { GrowthActionPolicy } from "./policy";
import type { GrowthCapabilityError, GrowthExecutionContext } from "./tool";

export interface ReceiptStore {
  claim: (input: {
    name: string;
    value: JsonValue;
    context: GrowthExecutionContext;
    toolCallId: string;
    policy: GrowthActionPolicy;
    startedAt: Date;
  }) => Promise<string | undefined>;
  read: (
    runId: string,
    toolCallId: string,
  ) => Promise<
    | {
        toolName: string;
        input: unknown;
        output: unknown;
        status: string;
      }
    | undefined
  >;
  finish: (
    id: string,
    input: {
      status: "completed" | "failed";
      output: JsonValue;
      error?: Record<string, unknown>;
      finishedAt: Date;
      durationMs: number;
    },
  ) => Promise<void>;
}

function failureOutput(error: unknown, value: unknown): GrowthCapabilityError {
  const compact = compactGrowthError(error);
  const action =
    typeof value === "object" &&
    value !== null &&
    "action" in value &&
    typeof value.action === "string"
      ? value.action
      : undefined;
  return {
    ok: false,
    ...(action ? { action } : {}),
    error: {
      code: compact.code,
      message: compact.error,
      suggestedAction: compact.suggestedAction,
    },
  };
}

function validateResult<Output>(
  schema: z.ZodType<Output>,
  value: unknown,
  replay: boolean,
) {
  const result = z.union([schema, capabilityErrorSchema]).safeParse(value);
  if (!result.success) {
    const paths = result.error.issues
      .map((issue) => issue.path.join(".") || "result")
      .slice(0, 5)
      .join(", ");
    throw new GrowthActionError(
      "conflict",
      `${replay ? "The saved tool receipt" : "The tool executed but its result"} does not match the output contract (${paths}). Inspect saved state before repeating this action.`,
    );
  }
  return result.data;
}

/** Compare JSON structurally: Postgres jsonb does not preserve object key order. */
function canonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key]!)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

/** Authorize every execution, including replay, and never repeat a claimed write. */
export async function executeReceipt<Output>(input: {
  name: string;
  value: unknown;
  toolCallId: string;
  context: GrowthExecutionContext;
  policy: GrowthActionPolicy;
  resultSchema: z.ZodType<Output>;
  assertAccess: (context: GrowthExecutionContext) => Promise<void>;
  execute: () => Promise<unknown>;
  receipts: ReceiptStore;
}): Promise<Output | GrowthCapabilityError> {
  const startedAt = new Date();
  let receiptId: string | undefined;
  try {
    // Authorization must precede both receipt reads and claiming a new call.
    await input.assertAccess(input.context);
    if (!input.policy.surfaces.includes(input.context.surface))
      throw new Error(
        `${input.name} is not available on the ${input.context.surface} surface.`,
      );
    const value = normalizeGrowthJson(input.value);
    receiptId = await input.receipts.claim({
      name: input.name,
      value,
      context: input.context,
      toolCallId: input.toolCallId,
      policy: input.policy,
      startedAt,
    });
    if (!receiptId) {
      const existing = await input.receipts.read(
        input.context.runId,
        input.toolCallId,
      );
      if (!existing)
        throw new Error(
          "Claimed tool receipt is unavailable. Inspect saved state before retrying.",
        );
      if (
        existing.toolName !== input.name ||
        canonicalJson(normalizeGrowthJson(existing.input)) !==
          canonicalJson(value)
      )
        throw new GrowthActionError(
          "conflict",
          "Tool call ID was reused with a different tool or input. Inspect saved state before retrying.",
        );
      if (existing.output !== null && existing.output !== undefined) {
        return validateResult(input.resultSchema, existing.output, true);
      }
      throw new Error(
        `Tool call ${input.toolCallId} is already ${existing.status}. Inspect saved state before retrying.`,
      );
    }
    const execution = await input.execute();
    if (
      typeof execution === "object" &&
      execution !== null &&
      Symbol.asyncIterator in execution
    )
      throw new Error("Streaming Growth tool outputs are not supported");
    const output = validateResult(
      input.resultSchema,
      normalizeGrowthJson(execution),
      false,
    );
    const failure = capabilityErrorSchema.safeParse(output);
    const finishedAt = new Date();
    await input.receipts.finish(receiptId, {
      status: failure.success ? "failed" : "completed",
      output: normalizeGrowthJson(output),
      ...(failure.success ? { error: failure.data.error } : {}),
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
    });
    return output;
  } catch (error) {
    const output = failureOutput(error, input.value);
    if (receiptId) {
      const finishedAt = new Date();
      await input.receipts.finish(receiptId, {
        status: "failed",
        output: normalizeGrowthJson(output),
        error: output.error,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
      });
    }
    return output;
  }
}
