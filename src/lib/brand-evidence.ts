import { z } from "zod";

export const brandStoryResultSchema = z.object({
  status: z.enum(["ready", "insufficient_evidence"]),
  story: z.string(),
  reason: z.string(),
});

/** A failed draft must never overwrite the operator's existing brief. */
export function requireBrandStory(
  result: z.infer<typeof brandStoryResultSchema>,
) {
  if (result.status !== "ready" || !result.story.trim()) {
    throw new Error(
      `Not enough evidence to write a brand story. ${result.reason.trim() || "Check the website, import homes, or write the story manually."}`,
    );
  }
  return result.story.trim();
}

export function requirePersonaEvidence(
  input: {
    insufficientEvidence: boolean;
    reason: string;
    suggestions: unknown[];
  },
  existingCount: number,
) {
  if (
    input.insufficientEvidence ||
    (!input.suggestions.length && !existingCount)
  ) {
    throw new Error(
      `Not enough evidence to define personas. ${input.reason.trim() || "Add specific guest occasions to the brand story, import homes, or use Shape."}`,
    );
  }
}
