import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output, type UserContent } from "ai";
import type { z } from "zod";

// One copy call as data: the prompt a generator would send, so production and
// the copy lab (/lab/copy) run the same words. A tune swaps the model, effort,
// system prompt or photos for an experiment without forking the generator.

export type CopyRequest<T> = {
  model: string;
  system: string;
  content: Exclude<UserContent, string>;
  schema: z.ZodType<T>;
  effort?: CopyEffort;
  /** A code check on the output; a non-null answer makes the model write again. */
  problem?: (output: T) => string | null;
  /** How a rejection is put back to the model. */
  rejected?: (problem: string) => string;
  attempts?: number;
};

export type CopyEffort = "low" | "medium" | "high";

export type CopyTune = {
  model?: string;
  effort?: CopyEffort | null;
  /** Replaces the generator's system prompt. */
  system?: string;
  /** Appended to the system prompt: a voice rule set, a steer. */
  appendix?: string;
  /** False drops every photo from the call. */
  images?: boolean;
};

export async function runCopyRequest<T>(
  request: CopyRequest<T>,
  tune: CopyTune = {},
) {
  const model = tune.model ?? request.model;
  const effort = tune.effort === undefined ? request.effort : tune.effort;
  const system = [tune.system ?? request.system, tune.appendix?.trim()]
    .filter(Boolean)
    .join("\n\n");
  const content =
    tune.images === false
      ? request.content.filter((part) => part.type !== "file")
      : request.content;
  const problems: string[] = [];
  const attempts = request.problem ? (request.attempts ?? 3) : 1;
  const usage = { inputTokens: 0, outputTokens: 0 };
  for (let attempt = 0; attempt < attempts; attempt++) {
    const last = problems.at(-1);
    const { output, usage: used } = await generateText({
      model: anthropic(model),
      system,
      messages: [
        {
          role: "user",
          content: last
            ? [
                ...content,
                {
                  type: "text",
                  text:
                    request.rejected?.(last) ??
                    `Your last answer was rejected: ${last} Write another.`,
                },
              ]
            : content,
        },
      ],
      output: Output.object({ schema: request.schema }),
      ...(effort ? { providerOptions: { anthropic: { effort } } } : {}),
    });
    usage.inputTokens += used.inputTokens ?? 0;
    usage.outputTokens += used.outputTokens ?? 0;
    const problem = request.problem?.(output) ?? null;
    if (!problem) return { output, problems, usage, model, system };
    problems.push(problem);
  }
  return { output: null, problems, usage, model, system };
}
