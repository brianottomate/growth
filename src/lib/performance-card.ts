import type { PerformanceSettings } from "@/server/db/brand-schema";
import { pipelineStage, type PipelineStage } from "./performance-pipeline";
import type { PerformanceCardState } from "./performance-card-state";
import type { ReadinessChecklist, ReadinessFix } from "./performance-readiness";
import { currentPeriod } from "./performance-billing";

export type PipelineBillingCycle = {
  period: string;
  billedAmount: number | null;
  mediaBudget: number | null;
  clientMediaContribution: number | null;
  feeInvoiceState?: "Not invoiced" | "Open" | null;
  mediaInvoiceState?: "Not invoiced" | "Open" | null;
  feePaidAt: Date | null;
  mediaPaidAt: Date | null;
};

export type PerformancePipelineCard = {
  id: string;
  name: string;
  logo: string | null;
  website: string | null;
  href: string;
  stage: PipelineStage;
  pipelineOrder: string | null;
  state: PerformanceCardState;
  management: number | null;
  spend: number | null;
  billingCycles: PipelineBillingCycle[];
  billing: {
    period: string;
    current: PipelineBillingCycle | null;
    upcoming: PipelineBillingCycle | null;
  };
  campaignCount: number;
  adCount: number;
  intakeUrl?: string | null;
  effectiveDate?: string | null;
  endDate?: string | null;
  terms?: string | null;
  note?: string | null;
  noteEditedAt?: string;
  noteEditedBy?: PerformanceSettings["noteEditedBy"];
  readiness?: {
    checklist: ReadinessChecklist;
    links: Record<ReadinessFix, string | null>;
  };
  lead?: StaffMember | null;
  csLead?: StaffMember | null;
};

type StaffMember = { id: string; name: string | null; image: string | null };

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
  billingCycles?: PipelineBillingCycle[];
  lead?: StaffMember | null;
  csLead?: StaffMember | null;
}): PerformancePipelineCard {
  const period = currentPeriod();
  const cycles = brand.billingCycles ?? [];
  const selectedPeriod = brand.settings?.cardState?.billingPeriod ?? period;
  const selectedCycle = cycles.find((cycle) => cycle.period === selectedPeriod);
  return {
    id: brand.id,
    name: brand.name,
    logo: brand.logo,
    website: brand.website,
    href: `/app/performance/clients/${brand.slug ?? brand.id}`,
    stage: pipelineStage({
      relationship: brand.relationship,
      pipelineStage: brand.settings?.pipelineStage,
    }),
    state: {
      ...brand.settings?.cardState,
      billingPeriod: selectedPeriod,
      managementPayment: selectedCycle?.feePaidAt
        ? "Paid"
        : (selectedCycle?.feeInvoiceState ?? null),
      spendPayment: selectedCycle?.mediaPaidAt
        ? "Paid"
        : (selectedCycle?.mediaInvoiceState ?? null),
    },
    pipelineOrder: brand.settings?.pipelineOrder ?? null,
    intakeUrl: brand.intakeUrl,
    effectiveDate: brand.settings?.effectiveDate,
    endDate: brand.settings?.endDate,
    terms: brand.settings?.terms,
    note: brand.settings?.note,
    noteEditedAt: brand.settings?.noteEditedAt,
    noteEditedBy: brand.settings?.noteEditedBy,
    management: brand.settings?.monthlyFee ?? null,
    spend: brand.settings?.agreedAdSpend ?? null,
    billingCycles: cycles,
    billing: {
      period,
      current: cycles.find((cycle) => cycle.period === period) ?? null,
      upcoming:
        cycles
          .filter((cycle) => cycle.period > period)
          .sort((a, b) => a.period.localeCompare(b.period))[0] ?? null,
    },
    lead: brand.lead ?? null,
    csLead: brand.csLead ?? null,
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
