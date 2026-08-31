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
  if (NoSuchToolError.isInstance(error)) {
    return `No such tool: ${error.toolName}.${
      error.availableTools?.length
        ? ` Available: ${error.availableTools.join(", ")}.`
        : ""
    }`;
  }
  if (InvalidToolInputError.isInstance(error)) {
    const cause =
      error.cause instanceof Error ? error.cause.message : error.message;
    return `Invalid input for ${error.toolName}: ${cause}`;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}
