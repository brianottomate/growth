import type { GrowthExecutionContext } from "./tool";
import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { ideaPreviewUrl, ideaShapeSchema } from "@/lib/ad-idea-studio";
import { catalogCardPreviewUrl } from "@/lib/catalog-studio";
import { adChatContext } from "@/server/services/ad-chat-context.service";
import { catalogHomeContext } from "@/server/services/catalog-studio.service";
import { renderCompositionUrl } from "@/server/services/composition.service";

/** Read-only visual inspection through the same renderer as the operator's preview. */
export function chatCreativePreview(identity: {
  userId: string;
  orgId: string;
}) {
  const images = new Map<string, string>();
  const inputSchema = z.object({
    target: z.discriminatedUnion("type", [
      z.object({
        type: z.literal("ad"),
        adId: z.string(),
        cardId: z.string(),
      }),
      z.object({
        type: z.literal("catalog"),
        brandId: z.string(),
        homeId: z.string(),
      }),
    ]),
    shape: ideaShapeSchema,
  });
  return tool<
    z.infer<typeof inputSchema>,
    z.infer<typeof inputSchema> & { previewUrl: string },
    GrowthExecutionContext
  >({
    description:
      "Inspect ONE saved ad slide or catalog card in ONE shape as an image. Use after a layout, text, crop, template or photo edit, before claiming the visible result is correct. For ads give adId and stable cardId; for catalog give brandId and homeId. Repeat sequentially for affected shapes. Does not save, approve or publish.",
    inputSchema,
    execute: async ({ target, shape }) => {
      let url: string | null | undefined;
      if (target.type === "ad") {
        const context = await adChatContext({
          organizationId: identity.orgId,
          adId: target.adId,
        });
        const card = context.ad.document.cards.find(
          (item) => item.id === target.cardId,
        );
        if (!card)
          throw new Error(
            "Slide not found. Read ideaContext for current stable card IDs.",
          );
        url = ideaPreviewUrl(context.brand.id, card, shape);
      } else {
        const context = await catalogHomeContext(
          identity.userId,
          target.brandId,
          target.homeId,
        );
        if (context.brand.organizationId !== identity.orgId || !context.card)
          throw new Error("Catalog card not found in this organization.");
        if (context.card.mode === "finished")
          throw new Error(
            "This is supplied artwork; overlay edits cannot change its visible text.",
          );
        if (shape !== "square")
          throw new Error(
            "The catalog currently exports square cards. Inspect square to match the operator's catalog preview.",
          );
        url = catalogCardPreviewUrl(context.brand.id, context.card, shape);
      }
      if (!url)
        throw new Error(
          "No image source for this shape. Read current state before changing it.",
        );
      const bytes = await renderCompositionUrl(identity.userId, url);
      images.set(url, bytes.toString("base64"));
      return {
        target,
        shape,
        previewUrl: url,
      };
    },
    toModelOutput: ({ output }) => {
      const image = images.get(output.previewUrl);
      if (!image)
        return {
          type: "text",
          value: `Previous preview reference: ${output.previewUrl}. Inspect again to see the current saved pixels.`,
        };
      return {
        type: "content",
        value: [
          {
            type: "text",
            text: JSON.stringify({
              target: output.target,
              shape: output.shape,
              previewUrl: output.previewUrl,
            }),
          },
          { type: "image-data", data: image, mediaType: "image/png" },
        ],
      };
    },
  });
}
