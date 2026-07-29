export const STORY_FORMATS = ["instagram.story", "facebook.story"] as const;

export type StoryFormat = (typeof STORY_FORMATS)[number];

export const isStoryFormat = (
  format: string | null | undefined,
): format is StoryFormat =>
  !!format && (STORY_FORMATS as readonly string[]).includes(format);

export const sequenceNoun = (
  format: string | null | undefined,
  count: number,
) => {
  if (isStoryFormat(format)) return count === 1 ? "frame" : "frames";
  return count === 1 ? "post" : "posts";
};

/**
 * Provider jobs in an ordered unit receive one-minute offsets. That keeps
 * Story frames and thread replies deterministic while preserving their shared
 * calendar day for normal-sized sequences.
 */
export const sequenceScheduledAt = (
  rootScheduledAt: Date,
  sequence: number | null | undefined,
) => new Date(rootScheduledAt.getTime() + Math.max(0, sequence ?? 0) * 60_000);
