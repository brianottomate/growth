import { z } from "zod";

/** Saved analyses have a stable product contract; provider metadata stays separate. */
export const libraryMediaAnalysisSchema = z.union([
  z.strictObject({
    altText: z.string(),
    analyzedAt: z.string(),
    description: z.string(),
    model: z.string(),
    name: z.string(),
    steer: z.string().optional(),
    tags: z.array(z.string()),
    version: z.number(),
  }),
  z.strictObject({
    altText: z.string(),
    analyzedAt: z.string(),
    description: z.string(),
    evidence: z.enum(["storyboard", "poster"]),
    hook: z.string(),
    keyBeats: z.array(
      z.strictObject({
        description: z.string(),
        frameNumber: z.number(),
        role: z.enum(["development", "hook", "turn", "payoff", "ending"]),
      }),
    ),
    model: z.string(),
    name: z.string(),
    pacing: z.string(),
    reusableLessons: z.array(z.string()),
    steer: z.string().optional(),
    structure: z.string(),
    summary: z.string(),
    tags: z.array(z.string()),
    transcript: z
      .strictObject({ language: z.string().optional(), text: z.string() })
      .nullable(),
    transcriptError: z.string().optional(),
    version: z.number(),
    visualStyle: z.string(),
  }),
]);

export const timelineVideoAnalysisSchema =
  libraryMediaAnalysisSchema.options[1].omit({
    altText: true,
    description: true,
    evidence: true,
    name: true,
    steer: true,
    tags: true,
    transcript: true,
    transcriptError: true,
  });
