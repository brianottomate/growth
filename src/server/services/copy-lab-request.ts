import "server-only";
import {
  runCopyRequest,
  type CopyRequest,
  type CopyTune,
} from "@/server/ai/copy-request";

/** One request run with the tune, its output in the shape the surface shows. */
function traceRequest<T>(request: CopyRequest<T>, tune: CopyTune) {
  return [
    {
      label: "Copy request",
      baseSystem: request.system,
      system: tune.system ?? request.system,
      appendix: tune.appendix?.trim() ?? "",
      content: request.content.flatMap(
        (part): { kind: "text" | "media"; text: string }[] => {
          if (part.type === "text")
            return [{ kind: "text" as const, text: part.text }];
          if (tune.images === false) return [];
          return [
            {
              kind: "media" as const,
              text:
                part.type === "file"
                  ? `Attached ${part.mediaType}`
                  : `Attached ${part.type}`,
            },
          ];
        },
      ),
    },
  ];
}

export async function go<T>(
  request: CopyRequest<T>,
  tune: CopyTune,
  shape: (output: T) => unknown = (output) => output,
) {
  const run = await runCopyRequest(request, tune);
  return {
    ...run,
    output: run.output === null ? null : shape(run.output),
    baseSystem: request.system,
    promptTrace: traceRequest(request, tune),
  };
}

/** A failed experiment call should not discard other surfaces. */
export async function safeGo<T>(
  request: CopyRequest<T>,
  tune: CopyTune,
  shape?: (output: T) => unknown,
) {
  try {
    return await go(request, tune, shape);
  } catch {
    return {
      output: null,
      problems: [
        "Generation failed for this surface; generate again to retry.",
      ],
      usage: { inputTokens: 0, outputTokens: 0 },
      model: tune.model ?? request.model,
      system: [tune.system ?? request.system, tune.appendix?.trim()]
        .filter(Boolean)
        .join("\n\n"),
      baseSystem: request.system,
      promptTrace: traceRequest(request, tune),
    };
  }
}
