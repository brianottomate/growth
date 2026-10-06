import { growthOperation } from "./growth-capabilities";

/** Domain dependencies used by every assistant surface's durable change feed. */
export function workspaceDomains(toolName: string): string[] {
  const name = growthOperation(toolName).capability;
  if (name.startsWith("brand"))
    return ["brand", "ads", "performance", "media", "website"];
  if (name.startsWith("ads"))
    return ["ads", "campaign", "performance", "media"];
  if (name.startsWith("persona")) return ["persona", "ads"];
  if (name.startsWith("performance")) return ["performance", "brand", "ads"];
  if (name.startsWith("productAtlas") || name.startsWith("storefront"))
    return ["productStorefront"];
  if (name.startsWith("contentStrategy"))
    return ["series", "content", "cadence"];
  if (name.startsWith("contentMedia") || name.startsWith("media"))
    return ["media", "content", "contentAnalysis", "composition", "ads"];
  if (name.startsWith("content") || name.startsWith("publishing"))
    return ["content", "blog", "channel", "inbox"];
  if (name.startsWith("sourceSync"))
    return [
      "brand",
      "channel",
      "channelSuggestion",
      "content",
      "contentSuggestion",
      "website",
    ];
  if (name.startsWith("email") || name === "newsletterAgent")
    return ["newsletter", "emailSequence", "content"];
  if (name === "blogAgent") return ["blog", "content"];
  if (name.startsWith("lifecycle")) return ["lifecycle"];
  if (name.startsWith("leads")) return ["leads"];
  if (name.startsWith("launch")) return ["launch", "content"];
  if (name.startsWith("amplification")) return ["amplifier", "performance"];
  if (name.startsWith("strategy") || name.startsWith("planning"))
    return ["cadence", "series", "content", "studio"];
  return ["creativeWork"];
}
export function queryMatchesDomains(
  key: readonly unknown[],
  domains: readonly string[],
) {
  const root: unknown = Array.isArray(key[0])
    ? key[0][0]
    : typeof key[0] === "string"
      ? key[0].split(".")[0]
      : undefined;
  return typeof root === "string" && domains.includes(root);
}
