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
  source: "brand" | "content" | "pillars";
  visibleText: string;
};

export type PlanEmailIntent = {
  type: "plan_email";
  brandId?: string;
  brandName?: string;
  visibleText: string;
};

export type AssistantIntent =
  | PlanTwoWeeksIntent
  | WorkContentIntent
  | BuildChannelStrategyIntent
  | ShapeContentStructureIntent
  | PlanEmailIntent;

export type ContentWorkContext = Omit<WorkContentIntent, "visibleText">;

export function sendAssistantIntent(intent: AssistantIntent) {
  window.dispatchEvent(
    new CustomEvent<AssistantIntent>(ASSISTANT_INTENT_EVENT, {
      detail: intent,
    }),
  );
}
