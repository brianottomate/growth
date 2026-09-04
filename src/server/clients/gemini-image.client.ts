import "server-only";

import { GoogleGenAI, type Part } from "@google/genai";

import { env } from "@/env";

export const GEMINI_IMAGE_MODEL = "gemini-3.1-flash-image";
export const isGeminiImageConfigured = Boolean(env.GEMINI_API_KEY);

const client = env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: env.GEMINI_API_KEY })
  : null;

function requireClient() {
  if (!client)
    throw new Error("Direct Google Gemini image generation is not configured.");
  return client;
}

async function referenceImagePart(url: string): Promise<Part> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok)
    throw new Error(
      `Could not load a Gemini reference image (${response.status}).`,
    );

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/"))
    throw new Error("A Gemini reference asset was not an image.");

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 20 * 1024 * 1024)
    throw new Error("A Gemini reference image exceeded 20 MB.");

  return {
    inlineData: {
      mimeType: contentType,
      data: bytes.toString("base64"),
    },
  };
}

export async function generateGeminiImage(input: {
  prompt: string;
  aspectRatio: string;
  referenceImageUrls?: string[];
  /** 1K is near one megapixel; 2K roughly doubles each edge. */
  imageSize?: "1K" | "2K";
}) {
  const referenceParts = await Promise.all(
    (input.referenceImageUrls ?? [])
      .slice(0, 4)
      .map((url) => referenceImagePart(url)),
  );
  const response = await requireClient().models.generateContent({
    model: GEMINI_IMAGE_MODEL,
    contents: [
      { role: "user", parts: [{ text: input.prompt }, ...referenceParts] },
    ],
    config: {
      responseModalities: ["IMAGE"],
      imageConfig: {
        aspectRatio: input.aspectRatio,
        imageSize: input.imageSize ?? "1K",
      },
    },
  });
  const image = response.candidates
    ?.flatMap((candidate) => candidate.content?.parts ?? [])
    .find((part) => part.inlineData?.data);
  if (!image?.inlineData?.data)
    throw new Error("Google Gemini returned no image candidate.");

  return {
    bytes: Buffer.from(image.inlineData.data, "base64"),
    contentType: image.inlineData.mimeType ?? "image/png",
    providerOutput: {
      responseId: response.responseId,
      modelVersion: response.modelVersion,
      finishReason: response.candidates?.[0]?.finishReason,
      usageMetadata: response.usageMetadata,
    },
  };
}
