import { workspaceProcedure } from "@/server/api/orpc";
import { createAdPreviewLinkInput } from "@/lib/ad-preview";
import { z } from "zod";
import {
  adPreviewOptions,
  createAdPreviewLink,
} from "@/server/services/ad-preview.service";

/**
 * Shareable previews of approved ads. Only the link is made here; the page
 * at /ad-preview/[token] reads the token on the server and has no procedures.
 */
export const adPreviewRouter = {
  options: workspaceProcedure
    .input(z.object({ brandId: z.string().min(1) }))
    .handler(({ context, input }) =>
      adPreviewOptions(context.workspace.orgId, input.brandId),
    ),
  createLink: workspaceProcedure
    .input(createAdPreviewLinkInput)
    .handler(({ context, input }) =>
      createAdPreviewLink(context.workspace.orgId, input),
    ),
};
