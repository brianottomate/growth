import type { AdContent } from "@/server/db/ads-schema";
/** Publishing consumes output, never an editable composition recipe. */
export function approvedOutput(content: AdContent): AdContent {
  if (!("media" in content)) return content;
  const { ideaStudio: _recipe, ...output } = content;
  return output;
}
