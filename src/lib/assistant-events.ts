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

export type AssistantIntent = PlanTwoWeeksIntent | WorkContentIntent;

export type ContentWorkContext = Omit<WorkContentIntent, "visibleText">;

export function sendAssistantIntent(intent: AssistantIntent) {
  window.dispatchEvent(
    new CustomEvent<AssistantIntent>(ASSISTANT_INTENT_EVENT, {
      detail: intent,
    }),
  );
}
