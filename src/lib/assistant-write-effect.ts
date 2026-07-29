const BLOG_WRITE_STEPS = new Set([
  "createDraft",
  "updateFields",
  "replaceBody",
  "insertBlock",
  "linkToGrowth",
  "reconcileGrowth",
]);

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
  if (toolName !== "blogAgent" || !Array.isArray(data?.trail)) return false;
  return (data.trail as unknown[]).some((entry) => {
    if (typeof entry !== "object" || entry === null) return false;
    const tool = (entry as Record<string, unknown>).tool;
    return typeof tool === "string" && BLOG_WRITE_STEPS.has(tool);
  });
}
