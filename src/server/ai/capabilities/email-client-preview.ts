import { z } from "zod";
import { growthAction } from "./types";
import { createEmailPreviewInput } from "@/lib/email-client-preview";
import {
  emailPreviewOptions,
  createEmailClientPreview,
} from "@/server/services/email-client-preview.service";
export const emailPreviewOptionsAction = growthAction({
  description:
    "List this brand's saved email editions available for client review, with newsletter membership and tentative dates. No recipients are included. Select exact IDs before sharing a preview.",
  inputSchema: z.object({ brandId: z.string().min(1) }),
  outputSchema: z.object({
    editions: z.array(
      z.object({
        id: z.string(),
        subject: z.string(),
        series: z.string().nullable(),
        status: z.string(),
        plannedAt: z.string().nullable(),
      }),
    ),
  }),
  execute: (input, ctx) => emailPreviewOptions(ctx.orgId, input.brandId),
});
export const shareEmailPreviewAction = growthAction({
  description:
    "Create an expiring, no-login client preview link for exactly the selected brand email IDs after explicit approval. Anyone with this link can read their latest saved creative and save all as PDF; future editions are not added. The content is live, not frozen. Does not approve content, resolve recipients, schedule delivery or send a message. Rotating the brand's connect token revokes these links.",
  inputSchema: createEmailPreviewInput,
  outputSchema: z.object({ url: z.string(), expiresAt: z.string() }),
  execute: (input, ctx) => createEmailClientPreview(ctx.orgId, input),
});
