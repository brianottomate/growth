import "server-only";

import { APICallError, RetryError } from "ai";

export type GrowthErrorCode =
  | "invalid_input"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "timeout"
  | "conflict"
  | "provider_unavailable"
  | "tool_failed";

/**
 * `suggestedAction` is derived from `code` and carries the retry policy in the
 * one form a reader can act on. There is deliberately no `retryable` boolean
 * beside it: nothing ever branched on one, `code` already implies it, and it
 * disagreed with its own sibling (`invalid_input` shipped `retryable: false`
 * next to "call the tool again"). A duplicate signal that contradicts the
 * accurate one is worse than no signal.
 */
export interface GrowthCompactError {
  error: string;
  code: GrowthErrorCode;
  suggestedAction: string;
}

/**
 * Throw this from an action guard that already knows why it failed.
 *
 * Everything else falls back to `codeFor`'s message sniffing, which is fine for
 * third-party errors we don't control but silently mis-grades our own guards:
 * a message with none of the trigger words lands on `tool_failed`, the most
 * discouraging code we have. A guard rejecting a bad id is `invalid_input` — the
 * model can fix the id and call again — so say so instead of hoping the sentence
 * happens to contain the word "invalid".
 */
export class GrowthActionError extends Error {
  constructor(
    readonly code: GrowthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GrowthActionError";
  }
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
  if (error instanceof GrowthActionError) return error.code;
  // ORPCError and service errors such as ProductStorefrontError carry an
  // HTTP-style code.
  if (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    if (error.code === "BAD_REQUEST") return "invalid_input";
    if (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")
      return "forbidden";
    if (error.code === "NOT_FOUND") return "not_found";
    if (error.code === "TOO_MANY_REQUESTS") return "rate_limited";
    if (error.code === "CONFLICT") return "conflict";
  }
  // Service errors such as GoogleDriveError carry an HTTP status instead.
  if (
    error instanceof Error &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    if (error.status === 400 || error.status === 422) return "invalid_input";
    if (error.status === 401 || error.status === 403) return "forbidden";
    if (error.status === 404) return "not_found";
    if (error.status === 409) return "conflict";
    if (error.status === 429) return "rate_limited";
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

/**
 * One sentence per code, and the only place the retry policy is stated.
 *
 * The three transient codes are why this map still exists rather than being
 * folded into the guard messages: they are the cases where no message can name
 * the recovery ("Zernio returned 429" does not tell you to wait, and does not
 * bound you to one attempt). For the deterministic codes the guard message is
 * the better carrier, so those sentences aim to be a floor, not the answer.
 */
const actions: Record<GrowthErrorCode, string> = {
  invalid_input: "Correct the input and call the tool again.",
  forbidden: "Explain that this action needs different workspace access.",
  not_found: "Refresh the relevant workspace data before trying again.",
  rate_limited: "Wait briefly, then retry once.",
  timeout: "Retry once; if it fails again, continue without this result.",
  conflict: "Read the current state before deciding whether to retry.",
  provider_unavailable:
    "Retry once; if it fails again, report the provider issue.",
  // The fallback code, so this sentence is read by every guard whose message
  // `codeFor` could not classify. It used to say "Do not retry blindly" full
  // stop, which is wrong for the common case: a guard that already told the
  // model what to fix, wrapped in an instruction to stop trying. Still no blind
  // retries, but a named correction is now permitted to be acted on.
  tool_failed:
    "Explain what could not be completed. Retry only if the message names a concrete correction, and never with the same arguments.",
};

export function compactGrowthError(error: unknown): GrowthCompactError {
  if (
    typeof error === "object" &&
    error !== null &&
    "error" in error &&
    "code" in error &&
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
    suggestedAction: actions[code],
  };
}
