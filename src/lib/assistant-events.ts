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

/**
 * "Set this website up as a client": the assistant runs the new-client-setup
 * playbook (brand, mark, photos, campaign shell, first ads) and stops before
 * any push. Fired from the ads desk's New client box.
 */
export type SetUpClientIntent = {
  type: "set_up_client";
  website: string;
  visibleText: string;
};

/** "Review in chat": the chat reviews a whole set of creative and fixes what it finds. */
export type ReviewPortfolioIntent = {
  type: "review_portfolio";
  brandId: string;
  brandName: string;
  surface: "catalog" | "ads";
  /** For ads: the campaign under review; absent for the draft set. */
  campaignId?: string;
  visibleText: string;
};

/** "Review in chat": a fresh chat walks one intake submission to applied. */
export type ReviewIntakeIntent = {
  type: "review_intake";
  newThread: true;
  brandId: string;
  brandName: string;
  intakeId: string;
  visibleText: string;
};

/** "Work in chat" on a tracker row: a fresh chat edits that client's row. */
export type WorkTrackerRowIntent = {
  type: "work_tracker_row";
  newThread: true;
  brandId: string;
  brandName: string;
  /** The row as the operator sees it, so the chat starts from the same values. */
  row: Record<string, string | number | null>;
  visibleText: string;
};

/** "Suggest featured homes": the chat ranks the brand's homes and proposes a set. */
export type SuggestFeaturedHomesIntent = {
  type: "suggest_featured_homes";
  brandId: string;
  brandName: string;
  visibleText: string;
};

/** "Define personas for this brand": the chat reads the brand and proposes them. */
export type DefinePersonasIntent = {
  type: "define_personas";
  brandId: string;
  brandName: string;
  visibleText: string;
};

/** "Start this client's first campaign": the chat runs the client-first-campaign playbook. */
export type StartClientCampaignIntent = {
  type: "start_client_campaign";
  brandId: string;
  brandName: string;
  visibleText: string;
};

/**
 * Work one home of a Performance client's catalog: its hero photo and its
 * card copy. Fired from the catalog's list rows; `focus` says which of the
 * row's buttons opened it.
 */
export type WorkCatalogHomeIntent = {
  type: "work_catalog_home";
  brandId: string;
  brandName: string;
  homeId: string;
  homeName: string;
  focus?: "photo" | "copy";
  visibleText: string;
};
export type CatalogHomeWorkContext = Omit<WorkCatalogHomeIntent, "visibleText">;

export type AssistantIntent =
  | WorkCatalogHomeIntent
  | StartClientCampaignIntent
  | DefinePersonasIntent
  | SuggestFeaturedHomesIntent
  | ReviewPortfolioIntent
  | ReviewIntakeIntent
  | WorkTrackerRowIntent
  | SetUpClientIntent
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
/**
 * The step of the campaign page the operator asked from. The chat gets a hint
 * so it starts on that step rather than reading the whole campaign back.
 */
export type CampaignFocus =
  | "copy"
  | "photos"
  | "ads"
  | "audiences"
  | "platforms"
  | "live";

export type WorkAdCampaignIntent = {
  adId?: string;
  type: "work_ad_campaign";
  newThread?: boolean;
  brandId: string;
  brandName: string;
  campaignId?: string;
  campaignName: string;
  focus?: CampaignFocus;
  visibleText: string;
};

export type ContentWorkContext = Omit<WorkContentIntent, "visibleText">;
export type AdCampaignWorkContext = Omit<WorkAdCampaignIntent, "visibleText">;

/** Intents that open their own chat session instead of joining the current one. */
export function wantsNewThread(intent: AssistantIntent): intent is Extract<
  AssistantIntent,
  { newThread?: boolean }
> & {
  brandId: string;
} {
  return "newThread" in intent && intent.newThread === true;
}

export function sendAssistantIntent(intent: AssistantIntent) {
  window.dispatchEvent(
    new CustomEvent<AssistantIntent>(ASSISTANT_INTENT_EVENT, {
      detail: intent,
    }),
  );
}
