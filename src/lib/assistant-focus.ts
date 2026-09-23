import type { AdCampaignWorkContext } from "./assistant-events";

/** A page-following turn must never inherit an older conversation's ad target. */
export function campaignFocusForTurn(input: {
  mode?: "page" | "pinned";
  intent?: AdCampaignWorkContext;
  page?: AdCampaignWorkContext;
  pinned?: AdCampaignWorkContext;
  saved?: AdCampaignWorkContext;
}) {
  return (
    input.intent ??
    (input.mode === "page"
      ? input.page
      : input.mode === "pinned"
        ? input.pinned
        : (input.pinned ?? input.saved))
  );
}
