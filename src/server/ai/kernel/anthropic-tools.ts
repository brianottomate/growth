import "server-only";
import { anthropic } from "@ai-sdk/anthropic";
import type { ToolSet } from "ai";

const eager = new Set([
  "presentNextOptions",
  "presentCopyOptions",
  "workspaceOverview",
  "brandRead__list",
  "operationRead__status",
]);

/** Provider discovery wraps tools after receipts and approval hooks are installed. */
export function anthropicTools<Tools extends ToolSet>(
  tools: Tools,
  activeTools?: string[],
) {
  const wrapped = { ...tools };
  for (const name in wrapped) {
    const definition = wrapped[name];
    if (!definition) continue;
    wrapped[name] = {
      ...definition,
      providerOptions: {
        ...definition.providerOptions,
        anthropic: {
          ...definition.providerOptions?.anthropic,
          deferLoading:
            !eager.has(name) &&
            name !== "selectToolDomain" &&
            name !== "inspectCreative" &&
            !(
              activeTools?.includes(name) &&
              [
                "performanceRead__pitch",
                "performanceRead__draftPitch",
                "performanceWrite__savePitch",
                "adsRead__ideaContext",
                "adsWrite__saveIdea",
                "adsRead__catalogHomeFacts",
                "adsWrite__editCatalogCard",
              ].includes(name)
            ),
        },
      },
    };
  }
  return { ...wrapped, toolSearch: anthropic.tools.toolSearchBm25_20251119() };
}
