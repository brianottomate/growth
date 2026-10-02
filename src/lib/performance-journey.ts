import {
  isClientStage,
  isClosedStage,
  type BusinessStage,
  type DeliveryStage,
} from "./performance-stage";

export const JOURNEY_COLUMNS = [
  "Prospecting",
  "Onboarding",
  "Building",
  "Ready for review",
  "Live",
  "Paused",
  "Closed",
] as const;
export type JourneyColumn = (typeof JOURNEY_COLUMNS)[number];

/** Commercial status and delivery are independent. Paused/closed accounts never look live. */
export function journeyColumn(brand: {
  business: BusinessStage;
  delivery: DeliveryStage;
}): JourneyColumn {
  if (isClosedStage(brand.business)) return "Closed";
  if (brand.business === "paused" || brand.delivery === "paused")
    return "Paused";
  if (brand.delivery === "live") return "Live";
  if (brand.delivery === "ads_review") return "Ready for review";
  if (brand.delivery === "access_verified") return "Building";
  if (isClientStage(brand.business) || brand.delivery === "intake_submitted")
    return "Onboarding";
  return "Prospecting";
}

export function matchesPortfolio(search: string, query: string): boolean {
  return query
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => search.toLowerCase().includes(term));
}
