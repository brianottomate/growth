/** Each sub-agent's steps that change durable data, by agent tool name. */
const AGENT_WRITE_STEPS: Record<string, Set<string>> = {
  blogAgent: new Set([
    "createDraft",
    "updateFields",
    "replaceBody",
    "insertBlock",
    "linkToGrowth",
    "reconcileGrowth",
  ]),
  newsletterAgent: new Set(["createIssue", "saveIssue"]),
};

/**
 * Completed capabilities that changed durable workspace data and therefore
 * need the surrounding server-rendered page to reconcile immediately.
 */
export function capabilityWritesWorkspace(
  toolName: string,
  data?: Record<string, unknown>,
) {
  if (toolName.endsWith("Write") || toolName === "prepareProductionPacket") {
    return true;
  }
  const writeSteps = AGENT_WRITE_STEPS[toolName];
  if (!writeSteps || !Array.isArray(data?.trail)) return false;
  return (data.trail as unknown[]).some((entry) => {
    if (typeof entry !== "object" || entry === null) return false;
    const tool = (entry as Record<string, unknown>).tool;
    return typeof tool === "string" && writeSteps.has(tool);
  });
}
