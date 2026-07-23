import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { z } from "zod";

export const MEDIA_ANALYSIS_VERSION = 1;
export const MEDIA_ANALYSIS_MODEL = "claude-sonnet-4-6";

/** Best-effort image media type from a URL's extension, for AI SDK file
 * parts (the "image" content part is deprecated). Unknown → image/jpeg. */
export function imageMediaType(url: string): string {
  const extension = new URL(url).pathname.split(".").pop()?.toLowerCase();
  const byExtension: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    heic: "image/heic",
    avif: "image/avif",
  };
  return (extension && byExtension[extension]) ?? "image/jpeg";
}

const analysisSchema = z.object({
  name: z.string().describe("A concise, useful 2-7 word asset name."),
  description: z
    .string()
    .describe("One factual sentence describing the visible image."),
  altText: z
    .string()
    .describe("Concise accessible alt text without filler such as 'image of'."),
  tags: z
    .array(z.string())
    .describe("Only exact tag names from the provided managed vocabulary."),
});

export type MediaAnalysis = z.infer<typeof analysisSchema> & {
  version: number;
  model: string;
  analyzedAt: string;
  steer?: string;
};

export async function analyzeMediaImage(input: {
  url: string;
  brandName: string;
  tags: { name: string; description: string | null }[];
  steer?: string;
}): Promise<MediaAnalysis> {
  const vocabulary = input.tags.length
    ? input.tags
        .map(
          (tag) =>
            `- ${tag.name}${tag.description ? `: ${tag.description}` : ""}`,
        )
        .join("\n")
    : "(No managed tags yet. Return an empty tags array.)";

  const { output } = await generateText({
    model: anthropic(MEDIA_ANALYSIS_MODEL),
    output: Output.object({ name: "MediaAnalysis", schema: analysisSchema }),
    temperature: 0.2,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Analyze this media-library image for the brand "${input.brandName}".

Be literal and useful. Do not infer claims, identities, locations, or campaign intent that are not visibly supported. Choose tags ONLY from the managed vocabulary below, copying their names exactly. It is fine to choose none.

Managed tags:
${vocabulary}${
              input.steer?.trim()
                ? `\n\nHuman correction or guidance (authoritative): ${input.steer.trim()}`
                : ""
            }`,
          },
          {
            type: "file",
            mediaType: imageMediaType(input.url),
            data: new URL(input.url),
          },
        ],
      },
    ],
  });

  const tagByLowerName = new Map(
    input.tags.map((tag) => [tag.name.toLowerCase(), tag.name] as const),
  );
  const tags = Array.from(
    new Set(
      output.tags
        .map((tag) => tagByLowerName.get(tag.trim().toLowerCase()))
        .filter((tag): tag is string => Boolean(tag)),
    ),
  );

  return {
    ...output,
    tags,
    version: MEDIA_ANALYSIS_VERSION,
    model: MEDIA_ANALYSIS_MODEL,
    analyzedAt: new Date().toISOString(),
    steer: input.steer?.trim() || undefined,
  };
}
