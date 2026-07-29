/**
 * audit-netnew-leads.ts — READ-ONLY audit of the "net-new" outbound candidates.
 *
 * For a SAMPLE of N net-new leads (default 20, NOT the full ~543) it reconciles
 * three sources per domain and writes a report you can read without re-running:
 *
 *   1. Our `leads.domain` row              — the ingested CSV snapshot (June 1)
 *   2. A fresh web enrichment              — discovery → AI extraction + a
 *                                            triangulated managed-unit estimate
 *   3. The LIVE HubSpot company record     — searched by domain, right now
 *
 * It surfaces the two data problems we found by hand on cozysuites.com:
 *
 *   • in_hubspot FALSE-POSITIVES — a lead we flagged "net-new" that is ALREADY
 *     in HubSpot (with a lead status / maybe an owner). Cold-emailing these
 *     collides with the sales motion. Our ingested flag lags the live CRM.
 *   • unit_count INFLATION — our ingested `unit_count` vs a fresh managed-unit
 *     estimate (cozysuites: 1759 in our DB, ~200 in reality).
 *
 * NO WRITES. Touches neither the DB nor HubSpot. Safe to run repeatedly.
 *
 *   bun --conditions react-server scripts/audit-netnew-leads.ts [N]
 *
 * Outputs (paths printed at the end):
 *   /tmp/netnew-audit-<ts>.md      ← human report (send this to Danny)
 *   /tmp/netnew-audit-<ts>.jsonl   ← raw per-lead records (for programmatic use)
 *
 * Required env: DATABASE_URL, ANTHROPIC_API_KEY, HUBSPOT_ACCESS_TOKEN_OPERATED,
 * plus the discovery provider keys (FIRECRAWL / PERPLEXITY / TAVILY / PARALLEL /
 * EXA — whichever are set get used; missing ones are skipped).
 */
import { writeFileSync, appendFileSync } from "node:fs";
import { sql } from "drizzle-orm";

import { db } from "@/server/db";
import { discoverDomain } from "@/server/services/lead-discovery.service";
import { extractFromDiscovery } from "@/server/services/lead-extraction.service";
import { estimateUnitsFromDiscovery } from "@/server/services/lead-unit-estimate.service";
import {
  findCompanyByDomain,
  getCompanyContacts,
  isHubspotConfigured,
  HUBSPOT_ACCOUNT_ID,
} from "@/server/clients/hubspot.client";

const N = Math.max(1, parseInt(process.argv[2] ?? "20", 10) || 20);
const CONCURRENCY = 4;
const UNIT_DISCREPANCY_RATIO = 2; // flag when our count and the web estimate diverge ≥2×

type Cand = {
  id: string;
  domain: string;
  company_name: string | null;
  unit_count: number | null;
  source_tier: string | null;
  pms: string | null;
};

type Audit = {
  domain: string;
  company: string | null;
  // unit reconciliation
  ourUnits: number | null;
  webUnits: number | null;
  webUnitRange: [number | null, number | null];
  webUnitConfidence: string | null;
  webUnitBasis: string | null;
  webUnitReasoning: string | null;
  unitRatio: number | null;
  unitDiscrepancy: boolean;
  // fit
  pregenFit: number | null;
  tier: string | null;
  redFlags: string[];
  // HubSpot (live)
  liveInHubspot: boolean;
  hubspotFlagStale: boolean; // we said net-new, live HubSpot disagrees
  hsLeadStatus: string | null;
  hsOwner: string | null;
  hsContacts: number;
  hsUrl: string | null;
  // web contacts (decision-makers found)
  webContacts: { name: string | null; role: string | null }[];
  verdict: string;
  error?: string;
};

function verdictFor(a: Audit): string {
  if (a.error) return "⚠️ error";
  if (a.liveInHubspot) return "🛑 already in HubSpot — exclude";
  if (a.pregenFit == null) return "review (no fit score)";
  if (a.pregenFit >= 60) return "✅ send candidate";
  if (a.pregenFit >= 30) return "🟡 review";
  return "⏭️ skip (weak fit)";
}

async function auditOne(c: Cand): Promise<Audit> {
  const base: Audit = {
    domain: c.domain,
    company: c.company_name,
    ourUnits: c.unit_count,
    webUnits: null,
    webUnitRange: [null, null],
    webUnitConfidence: null,
    webUnitBasis: null,
    webUnitReasoning: null,
    unitRatio: null,
    unitDiscrepancy: false,
    pregenFit: null,
    tier: null,
    redFlags: [],
    liveInHubspot: false,
    hubspotFlagStale: false,
    hsLeadStatus: null,
    hsOwner: null,
    hsContacts: 0,
    hsUrl: null,
    webContacts: [],
    verdict: "",
  };

  try {
    const discovery = await discoverDomain(c.domain);
    const [extraction, unit] = await Promise.all([
      extractFromDiscovery(discovery),
      estimateUnitsFromDiscovery(discovery, { oursPregen: c.unit_count }),
    ]);

    base.webUnits = unit.estimate.estimate;
    base.webUnitRange = [unit.estimate.low, unit.estimate.high];
    base.webUnitConfidence = unit.estimate.confidence;
    base.webUnitBasis = unit.estimate.basis;
    base.webUnitReasoning = unit.estimate.reasoning;
    base.pregenFit = extraction.structured.pregenFit.score;
    base.tier = extraction.structured.icpTierGuess;
    base.redFlags = extraction.structured.redFlags;
    base.webContacts = extraction.structured.contacts
      .filter((p) => p.name ?? p.role)
      .slice(0, 5)
      .map((p) => ({ name: p.name, role: p.role }));

    if (base.ourUnits != null && base.webUnits != null && base.webUnits > 0) {
      const hi = Math.max(base.ourUnits, base.webUnits);
      const lo = Math.min(base.ourUnits, base.webUnits);
      base.unitRatio = lo > 0 ? Math.round((hi / lo) * 10) / 10 : null;
      base.unitDiscrepancy =
        base.unitRatio != null && base.unitRatio >= UNIT_DISCREPANCY_RATIO;
    }
  } catch (e) {
    base.error = e instanceof Error ? e.message : String(e);
  }

  // Live HubSpot — independent of enrichment success.
  if (isHubspotConfigured) {
    try {
      const company = await findCompanyByDomain(c.domain);
      if (company) {
        base.liveInHubspot = true;
        base.hubspotFlagStale = true; // every candidate here is flagged net-new
        base.hsLeadStatus = company.values.hs_lead_status;
        base.hsOwner = company.values.hubspot_owner_id;
        base.hsUrl = `https://app.hubspot.com/contacts/${HUBSPOT_ACCOUNT_ID}/record/0-2/${company.id}`;
        try {
          base.hsContacts = (await getCompanyContacts(company.id)).length;
        } catch {
          /* contact pull is best-effort */
        }
      }
    } catch (e) {
      base.error =
        (base.error ? base.error + " | " : "") +
        `hubspot: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  base.verdict = verdictFor(base);
  return base;
}

// ── pick the sample: net-new filter (matches the /app/leads "Net-new" pill),
//    ordered by raw unit_count desc so we audit the TOP of the naive ranking —
//    exactly where inflated counts like cozysuites' 1759 surface first. ──
const candRes = await db.execute(sql`
  SELECT d.id, d.domain, d.company_name, d.unit_count, d.source_tier, d.pms
  FROM leads.domain d
  WHERE not d.in_hubspot and not d.has_hubspot_deal
    and not d.is_existing_customer and not d.exclude_from_outreach
    and d.score_pregen_potential is not null
    and exists (
      select 1 from leads.contact c
      where c.domain_id = d.id and c.deleted_at is null
        and (c.first_name is not null or c.last_name is not null
             or c.email !~* '@(gmail|yahoo|hotmail|aol|outlook|msn|icloud)\\.')
    )
  ORDER BY d.unit_count DESC NULLS LAST
  LIMIT ${N}
`);
const candidates = (candRes as unknown as { rows: Cand[] }).rows;

console.log(
  `Auditing ${candidates.length} net-new leads (sample of the ~543), HubSpot ${
    isHubspotConfigured
      ? "configured ✓"
      : "NOT configured ✗ (in_hubspot check skipped)"
  }…\n`,
);

const results: Audit[] = new Array<Audit>(candidates.length);
let cursor = 0;
let done = 0;
async function worker() {
  while (cursor < candidates.length) {
    const i = cursor++;
    const c = candidates[i]!;
    const a = await auditOne(c);
    results[i] = a;
    done++;
    console.log(
      `[${done}/${candidates.length}] ${a.domain.padEnd(34)} units ${String(a.ourUnits ?? "?").padStart(5)}→${String(a.webUnits ?? "?").padStart(4)} fit ${String(a.pregenFit ?? "?").padStart(3)}  ${a.verdict}`,
    );
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

// ── stats ──
const ok = results.filter((r) => !r.error);
const alreadyInHs = results.filter((r) => r.liveInHubspot);
const unitDisc = results.filter((r) => r.unitDiscrepancy);
const sendable = results.filter((r) => r.verdict.startsWith("✅"));
const review = results.filter(
  (r) => r.verdict.startsWith("🟡") || r.verdict.startsWith("review"),
);
const skip = results.filter((r) => r.verdict.startsWith("⏭️"));
const pct = (n: number) => `${Math.round((n / results.length) * 100)}%`;
const cell = (s: string | number | null | undefined) =>
  s == null ? "—" : String(s).replace(/\|/g, "/").replace(/\n/g, " ");

// ── markdown report ──
const ts = new Date().toISOString();
const md: string[] = [];
md.push(`# Net-new lead audit — sample of ${results.length}`);
md.push("");
md.push(`_Generated ${ts} · **read-only** (no writes to the DB or HubSpot)._`);
md.push("");
md.push(
  "**What this is:** the first ~543 cold-outbound candidates are leads we flagged " +
    "as *net-new* (not in our CRM snapshot), with a live rental site and a credible " +
    "contact. Before sending we sampled the top of that list (by our stored " +
    "`unit_count`) and reconciled each against a fresh web enrichment **and the live " +
    "HubSpot record**. Two problems we want your read on, Danny:",
);
md.push("");
md.push(
  `1. **Stale \`in_hubspot\` flag.** ${alreadyInHs.length}/${results.length} (${pct(alreadyInHs.length)}) of these "net-new" leads are **already in HubSpot** — our June-1 CSV snapshot missed them. If this rate holds across the 543, that's the share we'd wrongly cold-email over the top of sales.`,
);
md.push(
  `2. **Inflated \`unit_count\`.** ${unitDisc.length}/${results.length} (${pct(unitDisc.length)}) diverge ≥${UNIT_DISCREPANCY_RATIO}× from a fresh managed-unit estimate (e.g. cozysuites: 1759 stored vs ~200 real). Our stored count appears to include listings / historical data, which mis-ranks the list.`,
);
md.push("");
md.push("## Summary");
md.push("");
md.push(`| metric | value |`);
md.push(`|---|---|`);
md.push(`| leads audited | ${results.length} |`);
md.push(`| enrichment errors | ${results.length - ok.length} |`);
md.push(
  `| **already in HubSpot** (stale net-new flag) | **${alreadyInHs.length}** (${pct(alreadyInHs.length)}) |`,
);
md.push(
  `| unit-count discrepancies ≥${UNIT_DISCREPANCY_RATIO}× | ${unitDisc.length} (${pct(unitDisc.length)}) |`,
);
md.push(`| ✅ send candidates | ${sendable.length} |`);
md.push(`| 🟡 review | ${review.length} |`);
md.push(`| ⏭️ / 🛑 skip or exclude | ${skip.length + alreadyInHs.length} |`);
md.push("");
md.push("## Per-lead");
md.push("");
md.push(
  `| domain | company | our units | web est | live in HS? | HS lead status | fit | verdict |`,
);
md.push(`|---|---|--:|--:|:-:|---|--:|---|`);
for (const r of results) {
  md.push(
    `| ${cell(r.domain)} | ${cell(r.company)} | ${cell(r.ourUnits)} | ${cell(r.webUnits)}${r.unitDiscrepancy ? " ⚠️" : ""} | ${r.liveInHubspot ? "**YES**" : "no"} | ${cell(r.hsLeadStatus)} | ${cell(r.pregenFit)} | ${cell(r.verdict)} |`,
  );
}
md.push("");
md.push("## Detail");
md.push("");
for (const r of results) {
  md.push(`### ${r.domain}${r.company ? ` — ${r.company}` : ""}`);
  if (r.error) md.push(`- ⚠️ error: ${r.error}`);
  md.push(
    `- **Units:** ours \`${r.ourUnits ?? "?"}\` · web est \`${r.webUnits ?? "?"}\` (range ${r.webUnitRange[0] ?? "?"}–${r.webUnitRange[1] ?? "?"}, ${r.webUnitConfidence ?? "?"} confidence, basis: ${r.webUnitBasis ?? "?"})${r.unitDiscrepancy ? ` — ⚠️ **${r.unitRatio}× divergence**` : ""}`,
  );
  if (r.webUnitReasoning) md.push(`  - _${r.webUnitReasoning}_`);
  md.push(
    `- **HubSpot (live):** ${r.liveInHubspot ? `**ALREADY PRESENT** — status "${r.hsLeadStatus ?? "?"}", owner ${r.hsOwner ?? "none"}, ${r.hsContacts} contact(s) · ${r.hsUrl}` : "not found (genuinely net-new)"}`,
  );
  md.push(
    `- **Fit:** pregenFit \`${r.pregenFit ?? "?"}\` · tier ${r.tier ?? "?"}`,
  );
  if (r.redFlags.length)
    md.push(
      `- **Red flags:** ${r.redFlags.map((f) => f.replace(/\n/g, " ")).join("; ")}`,
    );
  if (r.webContacts.length)
    md.push(
      `- **Decision-makers found:** ${r.webContacts.map((p) => `${p.name ?? "?"}${p.role ? ` (${p.role})` : ""}`).join(", ")}`,
    );
  md.push(`- **Verdict:** ${r.verdict}`);
  md.push("");
}

const stamp = ts.replace(/[:.]/g, "-").slice(0, 19);
const mdPath = `/tmp/netnew-audit-${stamp}.md`;
const jsonlPath = `/tmp/netnew-audit-${stamp}.jsonl`;
writeFileSync(mdPath, md.join("\n"));
for (const r of results) appendFileSync(jsonlPath, JSON.stringify(r) + "\n");

console.log(`\n${"─".repeat(60)}`);
console.log(
  `Audited ${results.length} · already-in-HubSpot ${alreadyInHs.length} (${pct(alreadyInHs.length)}) · unit-discrepancies ${unitDisc.length} (${pct(unitDisc.length)})`,
);
console.log(
  `send ${sendable.length} · review ${review.length} · skip/exclude ${skip.length + alreadyInHs.length}`,
);
console.log(`\nReport (send to Danny): ${mdPath}`);
console.log(`Raw records:            ${jsonlPath}`);
process.exit(0);
