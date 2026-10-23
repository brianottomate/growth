import { metaDraftProviderControls } from "./zernio-ads";
/** Existing campaign owns its CBO budget. ABO must name this new set's amount. */
export function metaAdSetAdditionControls(input: {
  campaignId: string;
  campaignBudgeted: boolean;
  budget: number | null;
  budgetType: string | null;
}) {
  if (!input.campaignId)
    throw new Error("An existing Meta campaign ID is required");
  if (input.campaignBudgeted)
    return {
      existingCampaignId: input.campaignId,
      ...metaDraftProviderControls(),
    };
  if (
    !input.budget ||
    !Number.isInteger(input.budget) ||
    input.budget <= 0 ||
    !["daily", "lifetime"].includes(input.budgetType ?? "")
  )
    throw new Error("An explicit ad set budget and budget type are required");
  return {
    existingCampaignId: input.campaignId,
    budgetAmount: input.budget,
    budgetType: input.budgetType as "daily" | "lifetime",
    ...metaDraftProviderControls(),
  };
}

/** A saved intent may not silently change an existing campaign's live objective. */
export function metaGoalMatchesObjective(goal: string, objective: string) {
  const objectives: Record<string, readonly string[]> = {
    conversions: ["OUTCOME_SALES", "CONVERSIONS", "PRODUCT_CATALOG_SALES"],
    traffic: ["OUTCOME_TRAFFIC", "LINK_CLICKS"],
    awareness: ["OUTCOME_AWARENESS", "BRAND_AWARENESS", "REACH"],
    engagement: ["OUTCOME_ENGAGEMENT", "POST_ENGAGEMENT", "PAGE_LIKES"],
    video_views: ["OUTCOME_ENGAGEMENT", "OUTCOME_AWARENESS", "VIDEO_VIEWS"],
    lead_generation: ["OUTCOME_LEADS", "LEAD_GENERATION"],
  };
  return objectives[goal]?.includes(objective) ?? false;
}
