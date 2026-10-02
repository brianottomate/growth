/** Chat workflow helpers are current tools, not retired domain capabilities. */
export function isChatUtilityTool(name: string) {
  return name === "selectToolDomain" || name === "inspectCreative";
}
