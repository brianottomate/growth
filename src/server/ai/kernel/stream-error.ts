import { InvalidToolInputError, NoSuchToolError } from "ai";

/**
 * What a streaming failure should say.
 *
 * The AI SDK's default is the string "An error occurred.", and it reaches the
 * MODEL as well as the screen — so a tool call rejected for a missing field
 * comes back indistinguishable from a provider outage, and the next attempt is
 * a blind retry. Growth's domain tools make that likely: one flat object
 * serves every action, so the provider schema cannot mark a field required for
 * one action and optional for another, and validation rejects calls the model
 * was told were legal. Naming the field is what lets it self-correct.
 */
export function streamErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (
    /prompt is too long|context[_ ]length|maximum context|too much context/i.test(
      raw,
    )
  ) {
    return "This request contains too much context. Completed edits are saved. Start a new chat from the specific ad or home with your latest instructions; do not repeat completed edits.";
  }
  if (/tool_use.*tool_result|tool.call.*without.*result/i.test(raw)) {
    return "The response was interrupted while handling a tool. Completed edits are saved. Continue to read the current state and finish only the remaining work.";
  }
  if (NoSuchToolError.isInstance(error)) {
    return `No such tool: ${error.toolName}.${
      error.availableTools?.length
        ? ` Search the tools available in this section, or enable the relevant domain with selectToolDomain.`
        : ""
    }`;
  }
  if (InvalidToolInputError.isInstance(error)) {
    return `Invalid input for ${error.toolName}: ${compactValidationText(error)}`;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

type ZodishIssue = {
  path?: Array<string | number>;
  message?: string;
};

/** Walk the cause chain for a zod-shaped `issues` array. */
function zodIssues(error: unknown): ZodishIssue[] | null {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current; depth += 1) {
    if (typeof current === "object" && current !== null) {
      const candidate = (current as { issues?: unknown }).issues;
      if (Array.isArray(candidate)) return candidate as ZodishIssue[];
    }
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

/**
 * The raw failure is a serialized zod error — pages of JSON around one useful
 * sentence ("Invalid discriminator value. Expected 'draftCampaign' | …").
 * Pull the sentences out; the model needs them and the human should not have
 * to read past them.
 */
function compactValidationText(error: Error): string {
  const issues = zodIssues(error);
  if (issues?.length) {
    const lines = issues.slice(0, 3).map((issue) => {
      const path = (issue.path ?? []).join(".");
      const message = (issue.message ?? "invalid").slice(0, 300);
      return path ? `${path}: ${message}` : message;
    });
    const more = issues.length > 3 ? ` (+${issues.length - 3} more)` : "";
    return lines.join(" | ") + more;
  }
  const cause =
    error.cause instanceof Error ? error.cause.message : error.message;
  return cause.length > 500 ? `${cause.slice(0, 500)}…` : cause;
}
