export const ASSISTANT_INTENT_EVENT = "growth:assistant-intent";

export type PlanTwoWeeksIntent = {
  type: "plan_two_weeks";
  brandId: string;
  brandName: string;
  source: "content" | "calendar" | "brand_map";
  visibleText: string;
};

export type WorkContentIntent = {
  type: "work_content_post";
  brandId: string;
  brandName: string;
  contentPostId: string;
  contentTitle: string;
  platformPostId?: string;
  platform?: string;
  visibleText: string;
};

export type BuildChannelStrategyIntent = {
  type: "build_channel_strategy";
  brandId: string;
  brandName: string;
  visibleText: string;
};

export type ShapeContentStructureIntent = {
  type: "shape_content_structure";
  brandId: string;
  brandName: string;
  source: "brand" | "content" | "pillars" | "series";
  visibleText: string;
};

export type PlanEmailIntent = {
  type: "plan_email";
  brandId?: string;
  brandName?: string;
  visibleText: string;
};

/**
 * Hand one prospect to the assistant from the leads surface.
 *
 * The alternative was a button per action on the card — resolve channels, verify
 * people, generate, revise — which is the tool-count problem in UI form. Working
 * a prospect is order-dependent (does the preview resolve, is anyone reachable,
 * is there history worth leading with), so the operator states the goal and the
 * assistant sequences it.
 */
export type WorkProspectIntent = {
  type: "work_prospect";
  domain: string;
  companyName: string | null;
  visibleText: string;
};

export type AssistantIntent =
  | PlanTwoWeeksIntent
  | WorkContentIntent
  | BuildChannelStrategyIntent
  | ShapeContentStructureIntent
  | PlanEmailIntent
  | WorkProspectIntent
  | WorkAdCampaignIntent;

/**
 * Hand a campaign draft to the assistant — the paid counterpart of
 * work_content_post. The campaign page is read-only by design, so refining
 * headlines and primary text happens here, with the campaign in context.
 */
export type WorkAdCampaignIntent = {
  type: "work_ad_campaign";
  brandId: string;
  brandName: string;
  campaignId: string;
  campaignName: string;
  visibleText: string;
};

export type ContentWorkContext = Omit<WorkContentIntent, "visibleText">;
export type AdCampaignWorkContext = Omit<WorkAdCampaignIntent, "visibleText">;

export function sendAssistantIntent(intent: AssistantIntent) {
  window.dispatchEvent(
    new CustomEvent<AssistantIntent>(ASSISTANT_INTENT_EVENT, {
      detail: intent,
    }),
  );
}
