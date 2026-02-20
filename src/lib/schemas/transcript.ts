import { z } from "zod";

/**
 * API payload schema for transcript messages
 * Used for JSON serialization over HTTP (timestamps are ISO strings)
 */
export const transcriptMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  timestamp: z.string().optional(), // ISO string, optional
});

export type TranscriptMessagePayload = z.infer<typeof transcriptMessageSchema>;

/**
 * Request schema for extraction endpoint
 */
export const extractRequestSchema = z.object({
  messages: z.array(transcriptMessageSchema),
  previousData: z.record(z.string(), z.unknown()).optional(),
});

export type ExtractRequest = z.infer<typeof extractRequestSchema>;

/**
 * Request schema for story generation endpoint
 */
export const storyRequestSchema = z.object({
  messages: z.array(transcriptMessageSchema),
  extractedData: z.record(z.string(), z.unknown()),
});

export type StoryRequest = z.infer<typeof storyRequestSchema>;
