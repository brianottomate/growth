import "server-only";

import { z } from "zod";

import { createProductionPacket } from "@/server/services/creative-work.service";
import { growthTool } from "./types";

export const prepareProductionPacket = growthTool({
  description:
    "Save a complete, provider-neutral production packet after the operator and assistant have developed a usable creative direction. This is the first-class handoff for Claude Design, ChatGPT, a video editor, an agency, or Growth's optional Fal experiment. Preserve the operator's reviewed intent; include enough visual and execution detail that another tool can produce the asset without reconstructing the conversation. Do not call while the brief is still vague.",
  inputSchema: z.object({
    action: z.literal("prepare"),
    brandId: z.string(),
    contentPostId: z.string().optional(),
    title: z.string().trim().min(1).max(160),
    purpose: z.string().trim().min(1).max(1200),
    prompt: z.string().trim().min(1),
    negativePrompt: z.string().trim().optional(),
    aspectRatio: z.string().trim().optional(),
    outputFormat: z.string().trim().optional(),
    suggestedTool: z.string().trim().optional(),
    instructions: z.string().trim().optional(),
    referenceMediaAssetIds: z.array(z.string()).max(12).optional(),
  }),
  execute: async (input, ctx) => {
    const { action, ...packetInput } = input;
    const packet = await createProductionPacket({
      ...packetInput,
      organizationId: ctx.orgId,
      userId: ctx.userId,
      threadId: ctx.threadId,
    });
    return {
      ok: true as const,
      action,
      data: {
        packetId: packet.id,
        title: packet.title,
        purpose: packet.purpose,
        prompt: packet.prompt,
        negativePrompt: packet.negativePrompt,
        aspectRatio: packet.aspectRatio,
        outputFormat: packet.outputFormat,
        suggestedTool: packet.suggestedTool,
        instructions: packet.instructions,
        copyText: packet.copyText,
        contentPostId: packet.contentPostId,
        brandId: packet.brandId,
      },
    };
  },
});
