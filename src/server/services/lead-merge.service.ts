import { generateText, Output } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

import type { LeadEnrichmentExtraction } from "./lead-extraction.service";

/**
 * Lead merge — reconcile THREE views of a company (our DB row, the live
 * HubSpot record, and web enrichment) into one proposed record, field by
 * field, with a source + rationale for each. Pure proposal: no writes.
 *
 * The human reviews/edits the proposal in the drawer, then chooses what to
 * write and where (DB and/or HubSpot) — see leads.applyMerge.
 */

const MERGE_MODEL = "claude-sonnet-4-5";

// The fields we can write to BOTH our DB and HubSpot. Keep this list and the
// applyMerge write-mapping in sync.
export const MERGEABLE_FIELDS = [
  "companyName",
  "unitCount",
  "pms",
  "country",
  "state",
  "city",
  "pregenSiteUrl",
] as const;
export type MergeableField = (typeof MERGEABLE_FIELDS)[number];

const FIELD_LABELS: Record<MergeableField, string> = {
  companyName: "Company name",
  unitCount: "Unit / portfolio count",
  pms: "PMS",
  country: "Country",
  state: "State",
  city: "City",
  pregenSiteUrl: "Pregen site URL",
};

export const MergeProposalSchema = z.object({
  fields: z
    .array(
      z.object({
        key: z.enum(MERGEABLE_FIELDS),
        proposed: z
          .string()
          .nullable()
          .describe("The reconciled value to write (null if no good value)"),
        source: z
          .enum(["ours", "hubspot", "web", "merged", "none"])
          .describe("Which input the proposed value came from"),
        confidence: z.enum(["high", "medium", "low"]),
        reasoning: z
          .string()
          .describe("One sentence: why this value over the alternatives"),
      }),
    )
    .describe("One entry per mergeable field"),
  summary: z.string().describe("2-3 sentence overview of the reconciliation"),
  conflicts: z
    .array(z.string())
    .describe("Notable disagreements between sources a human should eyeball"),
});

export type MergeProposal = z.infer<typeof MergeProposalSchema>;

// A field row enriched with the raw source values, for the review UI.
export type MergeField = MergeProposal["fields"][number] & {
  label: string;
  ours: string | null;
  hubspot: string | null;
  web: string | null;
};

export type MergeResult = {
  domain: string;
  model: string;
  fields: MergeField[];
  summary: string;
  conflicts: string[];
};

// ---- inputs ----

export type OursView = {
  companyName: string | null;
  unitCount: number | null;
  pms: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  pregenSiteUrl: string | null;
};

export type HubspotView = {
  name: string | null;
  portfolio_size: string | null;
  pms_ai_identified: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  sites_preview_url: string | null;
} | null;

const str = (v: string | number | null | undefined): string | null =>
  v == null || v === "" ? null : String(v);

/** Project each source onto the mergeable-field axis for side-by-side context. */
function buildSourceRows(
  ours: OursView,
  hubspot: HubspotView,
  web: LeadEnrichmentExtraction | null,
): Record<MergeableField, { ours: string | null; hubspot: string | null; web: string | null }> {
  return {
    companyName: {
      ours: str(ours.companyName),
      hubspot: str(hubspot?.name),
      web: str(web?.company.brandName ?? web?.company.legalName),
    },
    unitCount: {
      ours: str(ours.unitCount),
      hubspot: str(hubspot?.portfolio_size),
      web: str(web?.portfolio.estimatedUnitCount),
    },
    pms: {
      ours: str(ours.pms),
      hubspot: str(hubspot?.pms_ai_identified),
      web: str(web?.pms.detected),
    },
    country: { ours: str(ours.country), hubspot: str(hubspot?.country), web: null },
    state: { ours: str(ours.state), hubspot: str(hubspot?.state), web: null },
    city: {
      ours: str(ours.city),
      hubspot: str(hubspot?.city),
      web: str(web?.company.hqLocation),
    },
    pregenSiteUrl: {
      ours: str(ours.pregenSiteUrl),
      hubspot: str(hubspot?.sites_preview_url),
      web: null,
    },
  };
}

const GUIDANCE = `You are reconciling three views of a property-management company for a sales/outreach database: OURS (our internal DB), HUBSPOT (the live sales CRM), and WEB (fresh web enrichment).

For each field, propose the single best value to standardize on. Rules:
- Prefer the most specific, recent, trustworthy value. HubSpot is sales-maintained and often authoritative for status/portfolio; web enrichment is freshest for site/PMS; ours is the import baseline.
- For unit/portfolio counts that disagree wildly, prefer the source most likely to be a real managed-property count and explain the discrepancy in conflicts.
- Never invent values. If no source has a good value, propose null with source "none".
- Keep reasoning to one sentence per field.`;

export async function proposeMerge(args: {
  domain: string;
  ours: OursView;
  hubspot: HubspotView;
  web: LeadEnrichmentExtraction | null;
}): Promise<MergeResult> {
  const rows = buildSourceRows(args.ours, args.hubspot, args.web);

  const context = MERGEABLE_FIELDS.map((k) => {
    const r = rows[k];
    return `- ${k}: ours=${r.ours ?? "—"} | hubspot=${r.hubspot ?? "—"} | web=${r.web ?? "—"}`;
  }).join("\n");

  const { output } = await generateText({
    model: anthropic(MERGE_MODEL),
    output: Output.object({
      name: "MergeProposal",
      description: "Field-by-field reconciliation of a company across sources",
      schema: MergeProposalSchema,
    }),
    prompt: `${GUIDANCE}\n\nDOMAIN: ${args.domain}\n\n=== FIELD VALUES BY SOURCE ===\n${context}`,
  });

  // Re-attach raw source values + labels, and guarantee one row per field even
  // if the model omits some.
  const byKey = new Map(output.fields.map((f) => [f.key, f]));
  const fields: MergeField[] = MERGEABLE_FIELDS.map((k) => {
    const r = rows[k];
    const proposed = byKey.get(k);
    return {
      key: k,
      label: FIELD_LABELS[k],
      ours: r.ours,
      hubspot: r.hubspot,
      web: r.web,
      proposed: proposed?.proposed ?? r.hubspot ?? r.ours ?? r.web ?? null,
      source: proposed?.source ?? "none",
      confidence: proposed?.confidence ?? "low",
      reasoning: proposed?.reasoning ?? "No proposal returned for this field.",
    };
  });

  return {
    domain: args.domain,
    model: MERGE_MODEL,
    fields,
    summary: output.summary,
    conflicts: output.conflicts,
  };
}
