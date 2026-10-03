import type { PerformanceSettings } from "@/server/db/brand-schema";
import { pipelineStage, type PipelineStage } from "./performance-pipeline";
import type { PerformanceCardState } from "./performance-card-state";

export type PerformancePipelineCard = {
  id: string;
  name: string;
  logo: string | null;
  website: string | null;
  href: string;
  stage: PipelineStage;
  state: PerformanceCardState;
  management: number | null;
  spend: number | null;
  campaignCount: number;
  adCount: number;
  intakeUrl?: string | null;
  effectiveDate?: string | null;
  endDate?: string | null;
  terms?: string | null;
  note?: string | null;
  noteEditedAt?: string;
  noteEditedBy?: PerformanceSettings["noteEditedBy"];
};

/** Recorded workflow state is never filled from campaigns, cycles, or the old delivery stage. */
export function performanceCardFromBrand(brand: {
  id: string;
  name: string;
  slug: string | null;
  logo: string | null;
  website: string | null;
  relationship: string;
  intakeUrl?: string | null;
  settings?: PerformanceSettings | null;
  campaigns: { adCount: number }[];
}): PerformancePipelineCard {
  return {
    id: brand.id,
    name: brand.name,
    logo: brand.logo,
    website: brand.website,
    href: `/app/performance/brands/${brand.slug ?? brand.id}`,
    stage: pipelineStage({
      relationship: brand.relationship,
      pipelineStage: brand.settings?.pipelineStage,
    }),
    state: brand.settings?.cardState ?? {},
    intakeUrl: brand.intakeUrl,
    effectiveDate: brand.settings?.effectiveDate,
    endDate: brand.settings?.endDate,
    terms: brand.settings?.terms,
    note: brand.settings?.note,
    noteEditedAt: brand.settings?.noteEditedAt,
    noteEditedBy: brand.settings?.noteEditedBy,
    management: brand.settings?.monthlyFee ?? null,
    spend: brand.settings?.agreedAdSpend ?? null,
    campaignCount: brand.campaigns.length,
    adCount: brand.campaigns.reduce(
      (sum, campaign) => sum + campaign.adCount,
      0,
    ),
  };
}

export function performanceWebsiteUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
