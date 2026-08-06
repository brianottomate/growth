/**
 * Does what we discovered about a lead disagree with what HubSpot says?
 *
 * Deliberately deterministic and dependency-free — no LLM, no network — because
 * this renders on every row. `lead-merge.service.ts` is the heavyweight
 * counterpart: it reconciles and proposes values for a human to apply in the
 * drawer. This only answers "is it worth opening that drawer", which is the part
 * you cannot afford to pay for per row.
 *
 * The two views are genuinely separate in storage even though several columns
 * are shared:
 * - HubSpot's view: `unitCount` (portfolio_size), `pms` (pms_ai_identified),
 *   `companyName` — all written by the webhook projection.
 * - What we discovered: `unitEstimate` from the unit-estimate pass, and
 *   `enrichment.extraction.*` / `enrichment.leadRank.*` from crawling the site.
 *
 * The ranker surfaced exactly this on coastalretreats.com — discovery notes said
 * RMS Cloud / 74 units where the lead row said OwnerRez / 44 — which is what
 * prompted making it a first-class flag.
 */

export type DriftSeverity = "high" | "low";

export type LeadDataDrift = {
  field: "unitCount" | "pms";
  label: string;
  hubspot: string;
  discovered: string;
  severity: DriftSeverity;
  note: string;
};

type DriftInput = {
  unitCount: number | null;
  unitEstimate: number | null;
  pms: string | null;
  enrichment: unknown;
};

function extractedPms(enrichment: unknown): string | null {
  const extraction = (
    enrichment as { extraction?: { pms?: { detected?: unknown } } } | null
  )?.extraction;
  const detected = extraction?.pms?.detected;
  return typeof detected === "string" && detected.trim()
    ? detected.trim()
    : null;
}

/** "your pms" is a placeholder value HubSpot carries, not a real platform. */
function meaningfulPms(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || /^your pms$/i.test(trimmed)) return null;
  return trimmed;
}

export function detectLeadDataDrift(input: DriftInput): LeadDataDrift[] {
  const drift: LeadDataDrift[] = [];

  // Units. Small differences are noise — an estimate is an estimate — so this
  // only fires when the two are far enough apart to change how we'd treat the
  // account. 40% or a 25-unit gap, whichever is looser.
  const hsUnits = input.unitCount;
  const ourUnits = input.unitEstimate;
  if (hsUnits != null && ourUnits != null && hsUnits > 0 && ourUnits > 0) {
    const gap = Math.abs(hsUnits - ourUnits);
    const ratio = gap / Math.max(hsUnits, ourUnits);
    if (ratio >= 0.4 && gap >= 5) {
      drift.push({
        field: "unitCount",
        label: "Unit count",
        hubspot: String(hsUnits),
        discovered: String(ourUnits),
        severity: gap >= 25 ? "high" : "low",
        note: `${gap} units apart (${Math.round(ratio * 100)}%)`,
      });
    }
  }

  // PMS. A different named platform is materially wrong: it decides whether we
  // can integrate at all, so it is always high.
  const hsPms = meaningfulPms(input.pms);
  const ourPms = meaningfulPms(extractedPms(input.enrichment));
  if (hsPms && ourPms && hsPms.toLowerCase() !== ourPms.toLowerCase()) {
    drift.push({
      field: "pms",
      label: "PMS",
      hubspot: hsPms,
      discovered: ourPms,
      severity: "high",
      note: "different platform detected on the site",
    });
  }

  return drift;
}
