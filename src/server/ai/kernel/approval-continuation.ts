import "server-only";

import { isDeepStrictEqual } from "node:util";
import { isToolUIPart, type UIMessage } from "ai";

export const APPROVAL_TTL_MS = 30 * 60 * 1_000;

type LooseApproval = {
  id?: unknown;
  approved?: unknown;
  reason?: unknown;
  [key: string]: unknown;
};

type LooseToolPart = {
  state?: unknown;
  approval?: LooseApproval;
  [key: string]: unknown;
};

function stableApproval(approval: LooseApproval | undefined) {
  if (!approval) return approval;
  const { approved: _approved, reason: _reason, ...stable } = approval;
  return stable;
}

function isValidApprovalTransition(
  stored: LooseToolPart,
  incoming: LooseToolPart,
) {
  if (
    stored.state !== "approval-requested" ||
    incoming.state !== "approval-responded" ||
    typeof incoming.approval?.approved !== "boolean" ||
    stored.approval?.id !== incoming.approval.id
  ) {
    return false;
  }
  const {
    state: _storedState,
    approval: storedApproval,
    ...storedStable
  } = stored;
  const {
    state: _incomingState,
    approval: incomingApproval,
    ...incomingStable
  } = incoming;
  return (
    isDeepStrictEqual(storedStable, incomingStable) &&
    isDeepStrictEqual(
      stableApproval(storedApproval),
      stableApproval(incomingApproval),
    )
  );
}

export function validateApprovalContinuation(
  stored: UIMessage,
  incoming: UIMessage,
): string | null {
  const { parts: _storedParts, ...storedEnvelope } = stored;
  const { parts: _incomingParts, ...incomingEnvelope } = incoming;
  if (
    stored.role !== "assistant" ||
    incoming.role !== "assistant" ||
    !isDeepStrictEqual(storedEnvelope, incomingEnvelope) ||
    stored.parts.length !== incoming.parts.length
  ) {
    return "Approval continuation does not match the stored assistant turn";
  }

  let responses = 0;
  for (const [index, storedPart] of stored.parts.entries()) {
    const incomingPart = incoming.parts[index];
    if (!incomingPart) {
      return "Approval continuation is missing part of the stored assistant turn";
    }
    if (isToolUIPart(storedPart) && storedPart.state === "approval-requested") {
      if (
        !isToolUIPart(incomingPart) ||
        !isValidApprovalTransition(storedPart, incomingPart)
      ) {
        return "Approval response changed the requested action";
      }
      responses++;
      continue;
    }
    if (!isDeepStrictEqual(storedPart, incomingPart)) {
      return "Approval continuation changed the stored assistant turn";
    }
  }
  return responses > 0 ? null : "No pending approval exists on this turn";
}

export function approvalHasExpired(input: {
  createdAt: Date;
  now: Date;
}): boolean {
  return input.now.getTime() - input.createdAt.getTime() > APPROVAL_TTL_MS;
}

/** Expiry can forbid execution while still allowing the operator to dismiss an action. */
export function isApprovalDenial(message: UIMessage) {
  const responses = message.parts.filter(
    (part) => isToolUIPart(part) && part.state === "approval-responded",
  );
  return (
    responses.length > 0 &&
    responses.every(
      (part) =>
        isToolUIPart(part) &&
        part.state === "approval-responded" &&
        part.approval.approved === false,
    )
  );
}
