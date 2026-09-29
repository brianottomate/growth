import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import sharp from "sharp";
import { z } from "zod";

import {
  compositionImagePositionSchema,
  getCompositionFormat,
  type CompositionFormatId,
} from "@/lib/compositions";
import { fetchPublicImage } from "@/server/services/media.service";

const MODEL = "claude-sonnet-5";

/** Which side of a photo a cover crop to `formatId` should keep. */
export async function suggestImagePosition(input: {
  url: string;
  formatId: CompositionFormatId;
}) {
  const { body } = await fetchPublicImage(input.url);
  const photo = sharp(body);
  const meta = await photo.metadata();
  const image = await photo
    .resize({ width: 800, withoutEnlargement: true })
    .flatten({ background: "#000000" })
    .jpeg({ quality: 82 })
    .toBuffer();
  const format = getCompositionFormat(input.formatId);
  const { output } = await generateText({
    model: anthropic(MODEL),
    output: Output.object({
      schema: z.object({ imagePosition: compositionImagePositionSchema }),
    }),
    system:
      "You crop vacation-home photos for paid-social ads. A cover crop keeps the full width or height and trims the rest. Choose which side the crop keeps so the subject (the room, the house, the view the photo is about) stays in frame: top or bottom when the photo is trimmed vertically, left or right when it is trimmed horizontally, center when the subject is centred or nothing is trimmed on that axis.",
    messages: [
      {
        role: "user",
        content: [
          { type: "image", image },
          {
            type: "text",
            text: `The photo is ${meta.width ?? "?"}×${meta.height ?? "?"}. It is cropped to ${format.label.toLowerCase()} ${format.width}×${format.height}.`,
          },
        ],
      },
    ],
  });
  return output.imagePosition;
}
