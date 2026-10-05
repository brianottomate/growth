import type { z } from "zod";
import "server-only";
import {
  chatNextOptionsSchema,
  chatNextOptionsOutputSchema,
} from "@/lib/chat-next-options";
import { growthTool } from "./types";
export const presentNextOptions = growthTool({
  description:
    "Offer up to three concrete follow-ups after your response. Use the operator's voice and known workspace facts. An answer replies to your question; a request asks for supported work; a detail opens an editable draft. Present once, at the end, only when a useful choice exists. Never imply the work already happened, offer unsupported actions, or duplicate pending approval controls. This tool only presents choices.",
  inputSchema: chatNextOptionsSchema,
  resultSchema: chatNextOptionsOutputSchema,
  execute: async ({
    options,
  }): Promise<z.output<typeof chatNextOptionsOutputSchema>> => ({
    ok: true as const,
    action: "present" as const,
    data: { options },
  }),
});
