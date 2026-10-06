import { z } from "zod";
import "server-only";
import {
  chatNextOptionsSchema,
  chatNextOptionsOutputSchema,
} from "@/lib/chat-next-options";
import { growthTool } from "./types";

const LABEL_MAX = 48;

// The label limit is the button's, not a reason to fail the turn: a 49-character
// label used to surface as a raw validation error in the chat. Clamp instead.
const inputSchema = chatNextOptionsSchema.extend({
  options: z
    .array(
      chatNextOptionsSchema.shape.options.element.extend({
        label: z
          .string()
          .trim()
          .min(1)
          .describe(`A button label, ${LABEL_MAX} characters at most.`),
      }),
    )
    .min(1)
    .max(3),
});

const clamp = (label: string) =>
  label.length > LABEL_MAX
    ? `${label.slice(0, LABEL_MAX - 1).trimEnd()}…`
    : label;

export const presentNextOptions = growthTool({
  description:
    "Offer up to three concrete follow-ups after your response. Use the operator's voice and known workspace facts. An answer replies to your question; a request asks for supported work; a detail opens an editable draft. Present once, at the end, only when a useful choice exists. Never imply the work already happened, offer unsupported actions, or duplicate pending approval controls. This tool only presents choices.",
  inputSchema,
  resultSchema: chatNextOptionsOutputSchema,
  execute: async ({
    options,
  }): Promise<z.output<typeof chatNextOptionsOutputSchema>> => ({
    ok: true as const,
    action: "present" as const,
    data: {
      options: options.map((option) => ({
        ...option,
        label: clamp(option.label),
      })),
    },
  }),
});
