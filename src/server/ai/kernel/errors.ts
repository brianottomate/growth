import "server-only";

import { APICallError, RetryError } from "ai";
import { TRPCError } from "@trpc/server";

export type GrowthErrorCode =
  | "invalid_input"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "timeout"
  | "conflict"
  | "provider_unavailable"
  | "tool_failed";

export interface GrowthCompactError {
  error: string;
  code: GrowthErrorCode;
  retryable: boolean;
  suggestedAction: string;
}

const secretPatterns = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi,
  /\b(?:sk|pk)-[A-Za-z0-9_-]{12,}\b/g,
];

function sanitize(message: string): string {
  let safe = message.replace(/\s+/g, " ").trim();
  for (const pattern of secretPatterns)
    safe = safe.replace(pattern, "[redacted]");
  return safe.slice(0, 600) || "The tool could not complete the request.";
}

function codeFor(error: unknown): GrowthErrorCode {
  if (error instanceof TRPCError) {
    if (error.code === "BAD_REQUEST") return "invalid_input";
    if (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")
      return "forbidden";
    if (error.code === "NOT_FOUND") return "not_found";
    if (error.code === "TOO_MANY_REQUESTS") return "rate_limited";
    if (error.code === "CONFLICT") return "conflict";
  }
  if (RetryError.isInstance(error)) return "provider_unavailable";
  if (APICallError.isInstance(error)) {
    if (error.statusCode === 429) return "rate_limited";
    if (error.statusCode === 408) return "timeout";
    if ((error.statusCode ?? 0) >= 500) return "provider_unavailable";
  }
  if (error instanceof Error) {
    if (error.name === "TimeoutError") return "timeout";
    const message = error.message.toLowerCase();
    if (message.includes("not found") || message.includes("no such"))
      return "not_found";
    if (
      message.includes("access") ||
      message.includes("permission") ||
      message.includes("forbidden") ||
      message.includes("organization")
    )
      return "forbidden";
    if (message.includes("invalid") || message.includes("required"))
      return "invalid_input";
    if (message.includes("conflict") || message.includes("already"))
      return "conflict";
  }
  return "tool_failed";
}

const retryable = new Set<GrowthErrorCode>([
  "rate_limited",
  "timeout",
  "provider_unavailable",
]);

const actions: Record<GrowthErrorCode, string> = {
  invalid_input: "Correct the input and call the tool again.",
  forbidden: "Explain that this action needs different workspace access.",
  not_found: "Refresh the relevant workspace data before trying again.",
  rate_limited: "Wait briefly, then retry once.",
  timeout: "Retry once; if it fails again, continue without this result.",
  conflict: "Read the current state before deciding whether to retry.",
  provider_unavailable:
    "Retry once; if it fails again, report the provider issue.",
  tool_failed: "Do not retry blindly; explain what could not be completed.",
};

export function compactGrowthError(error: unknown): GrowthCompactError {
  if (
    typeof error === "object" &&
    error !== null &&
    "error" in error &&
    "code" in error &&
    "retryable" in error &&
    "suggestedAction" in error
  ) {
    const value = error as GrowthCompactError;
    return { ...value, error: sanitize(value.error) };
  }

  const code = codeFor(error);
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "The tool could not complete the request.";
  return {
    error: sanitize(raw),
    code,
    retryable: retryable.has(code),
    suggestedAction: actions[code],
  };
}
