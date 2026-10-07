import "server-only";
import {
  copySuggestionsSchema,
  copySuggestionsOutputSchema,
} from "@/lib/copy-suggestions";
import { growthTool } from "./types";

export const presentCopyOptions = growthTool({
  description:
    "Present 3–5 distinct, fact-backed copy sets for ONE catalog home or ad, as selectable cards. Read catalogHomeFacts or ideaContext first and use exact brand/home/ad and stable card IDs. Include only proposed copy fields: ad captions (shape null means shared), per-card Meta text, composition overlays (shape null means base), or catalog headline/pills. Missing fields stay unchanged; empty text explicitly clears a field. Coordinate caption and image text as one set when requested. This tool only displays suggestions, never saves. Clicking Apply sends the exact selected words to chat for a fresh read and a scoped draft edit via editCatalogCard or saveIdea. Do not offer supplied-artwork overlay edits as if they were editable. Use instead of repeating options in prose or next-action chips.",
  inputSchema: copySuggestionsSchema,
  resultSchema: copySuggestionsOutputSchema,
  execute: async ({ target, options }) => ({
    ok: true as const,
    action: "present" as const,
    data: { target, options },
  }),
});
