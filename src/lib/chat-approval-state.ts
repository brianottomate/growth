export type ChatMessageRole = { role: string };

/** A later operator turn supersedes every unresolved approval above it. */
export function isApprovalSuperseded(
  messages: readonly ChatMessageRole[],
  messageIndex: number,
): boolean {
  return messages
    .slice(messageIndex + 1)
    .some((message) => message.role === "user");
}
