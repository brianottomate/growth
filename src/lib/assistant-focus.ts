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

/** Latest explicit snapshot wins, including a cleared target. */
export function latestAssistantFocus(
  messages: { role: string; metadata?: unknown }[],
) {
  for (const message of [...messages].reverse()) {
    if (
      message.role !== "user" ||
      !message.metadata ||
      typeof message.metadata !== "object"
    )
      continue;
    const metadata = message.metadata as AssistantFocus;
    if (
      "contextMode" in metadata ||
      "catalogHomeContext" in metadata ||
      "adWorkContext" in metadata ||
      "workContext" in metadata
    )
      return metadata;
  }
  return undefined;
}

export type AssistantFocus = {
  initiativeContext?: import("./assistant-events").WorkInitiativeIntent | null;
  brandId?: string;
  contextMode?: "page" | "pinned";
  catalogHomeContext?:
    | import("./assistant-events").CatalogHomeWorkContext
    | null;
  adWorkContext?: AdCampaignWorkContext | null;
  workContext?: import("./assistant-events").ContentWorkContext | null;
};

export function catalogFocusForTurn(input: {
  mode?: "page" | "pinned";
  intent?: import("./assistant-events").AssistantIntent;
  pinned?: import("./assistant-events").CatalogHomeWorkContext;
  saved?: import("./assistant-events").CatalogHomeWorkContext | null;
}) {
  if (input.intent)
    return input.intent.type === "work_catalog_home" ? input.intent : undefined;
  if (input.mode === "page") return undefined;
  if (input.mode === "pinned") return input.pinned;
  return input.pinned ?? input.saved ?? undefined;
}

export function assistantFocusLabel(focus?: AssistantFocus) {
  if (focus?.initiativeContext) return "Initiative";
  if (focus?.catalogHomeContext) return focus.catalogHomeContext.homeName;
  if (focus?.adWorkContext)
    return `${focus.adWorkContext.campaignName}${focus.adWorkContext.adId ? " · Selected ad" : ""}`;
  if (focus?.workContext)
    return `${focus.workContext.contentTitle}${focus.workContext.platform ? ` · ${focus.workContext.platform}` : ""}`;
  return undefined;
}

/** Compare identities, ignoring labels and one-turn hints. */
export function sameTurnFocus(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
) {
  const key = (context: Record<string, unknown>) => {
    const intent = context.assistantIntent as
      | import("./assistant-events").AssistantIntent
      | undefined;
    const home = catalogFocusForTurn({
      mode: context.contextMode as "page" | "pinned" | undefined,
      intent,
      pinned: context.catalogContext as
        | import("./assistant-events").CatalogHomeWorkContext
        | undefined,
    });
    const campaign = intent
      ? intent.type === "work_ad_campaign"
        ? intent
        : undefined
      : (context.campaignContext as AdCampaignWorkContext | undefined);
    const work = intent
      ? intent.type === "work_content_post"
        ? intent
        : undefined
      : (context.workContext as
          | import("./assistant-events").ContentWorkContext
          | undefined);
    return JSON.stringify([
      home?.brandId ??
        campaign?.brandId ??
        work?.brandId ??
        (intent && "brandId" in intent ? intent.brandId : context.brandId),
      intent?.type === "work_initiative" ? intent.initiativeId : undefined,
      home?.homeId,
      campaign?.campaignId,
      campaign?.adId,
      work?.contentPostId,
      work?.platformPostId,
      !home && !campaign && !work && context.contextMode !== "pinned"
        ? context.pagePath
        : null,
    ]);
  };
  return key(left) === key(right);
}
