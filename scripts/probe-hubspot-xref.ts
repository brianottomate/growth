/**
 * LOCAL PROBE — enrich 20 NEW permit companies (agentic domain discovery), then
 * cross-reference each against HubSpot to decide net-new vs. already-in-CRM.
 *
 * Match by precision: domain (verified) > phone (permit phones are real) > name
 * (weak candidate — collisions like "plum ∈ plumlee", never auto-suppress).
 *
 * No DB writes. Excludes companies already covered by the last probe run.
 *
 * Run:  bun --conditions react-server scripts/probe-hubspot-xref.ts [N]
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { discoverDomain } from "@/server/services/domain-discovery.service";
import {
  findCompaniesByDomains,
  findCompaniesByName,
  findCompaniesByPhone,
  findContactsByPhone,
  isHubspotConfigured,
} from "@/server/clients/hubspot.client";

const CSV = join(homedir(), "Downloads", "pm_companies.csv");
const SCRATCH =
  "/private/tmp/claude-501/-Users-kristianeboe-Developer-wander-growth/97f22627-49a1-491b-a471-78b31d2fd584/scratchpad";
const PRIOR = join(SCRATCH, "permit-probe-report.json");
const OUT = join(SCRATCH, "hubspot-xref-report.json");
const N = parseInt(process.argv[2] ?? "20", 10);

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "", row: string[] = [], q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift() ?? [];
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

const cleanCity = (m: string) => (m.split("(")[0]?.split("/")[0] ?? m).trim();
const permits = (r: Record<string, string>) => parseInt(r.permits || "0", 10) || 0;

console.log(`HubSpot configured: ${isHubspotConfigured}`);

// Exclude entities already probed in the last run, so this is genuinely "new".
const tested = new Set<string>();
if (existsSync(PRIOR)) {
  try {
    for (const r of JSON.parse(readFileSync(PRIOR, "utf8")) as { entity: string }[]) {
      tested.add(r.entity);
    }
  } catch { /* ignore */ }
}

const all = parseCsv(readFileSync(CSV, "utf8"));
const pool = all.filter((r) => (r.entity_name ?? "") && !tested.has(r.entity_name ?? ""));
pool.sort((a, b) => permits(b) - permits(a));
// stratified spread across the permit range of the untested pool
const sample = Array.from({ length: N }, (_, k) =>
  pool[Math.round((k * (pool.length - 1)) / Math.max(1, N - 1))],
).filter((r): r is Record<string, string> => Boolean(r));

console.log(`Probing ${sample.length} NEW PM companies (excluded ${tested.size} already tested)\n`);

type Row = {
  entity: string; permits: number; market: string;
  discovered: string | null; confidence: string;
  hsAxes: string[]; hsName: string | null; hsOwnerId: string | null;
  hsLeadStatus: string | null; hsLifecycle: string | null;
  verdict: "in-crm" | "name-candidate" | "net-new";
};
const results: Row[] = [];

for (const r of sample) {
  const entity = r.entity_name ?? "";
  const market = r.market ?? "";
  const phone = r.phone || "";

  const disc = await discoverDomain({
    name: entity,
    city: cleanCity(market),
    state: r.state || null,
    phone: phone || null,
    knownEmail: r.email || null,
  });

  const axes: string[] = [];
  let hsName: string | null = null, hsOwnerId: string | null = null;
  let hsLeadStatus: string | null = null, hsLifecycle: string | null = null;

  // 1. domain (strongest)
  if (disc.domain) {
    try {
      const m = await findCompaniesByDomains([disc.domain]);
      const c = m.get(disc.domain.toLowerCase());
      if (c) {
        axes.push("domain");
        hsName = c.values.name; hsOwnerId = c.values.hubspot_owner_id; hsLeadStatus = c.values.hs_lead_status;
      }
    } catch { /* ignore */ }
  }
  // 2. phone (high precision — permit phones are real)
  if (phone) {
    const [cos, contacts] = await Promise.all([findCompaniesByPhone(phone), findContactsByPhone(phone)]);
    if (cos.length || contacts.length) {
      axes.push("phone");
      const c = cos[0];
      if (c) { hsName ??= c.name; hsOwnerId ??= c.ownerId; hsLeadStatus ??= c.leadStatus; hsLifecycle ??= c.lifecycleStage; }
      const ct = contacts[0];
      if (ct) hsOwnerId ??= ct.ownerId;
    }
  }
  // 3. name (weak candidate — never auto-suppress on this alone)
  const nameHits = await findCompaniesByName(entity);
  if (nameHits.length) {
    axes.push(`name×${nameHits.length}`);
    const c = nameHits[0];
    if (c) { hsName ??= c.name; hsOwnerId ??= c.ownerId; hsLeadStatus ??= c.leadStatus; hsLifecycle ??= c.lifecycleStage; }
  }

  const strong = axes.some((a) => a === "domain" || a === "phone");
  const verdict: Row["verdict"] = strong ? "in-crm" : axes.length ? "name-candidate" : "net-new";

  results.push({
    entity, permits: permits(r), market,
    discovered: disc.domain, confidence: disc.confidence,
    hsAxes: axes, hsName, hsOwnerId, hsLeadStatus, hsLifecycle, verdict,
  });

  const tag = verdict === "in-crm" ? "IN-CRM " : verdict === "name-candidate" ? "?name  " : "NET-NEW";
  console.log(
    `${tag} ${(disc.domain ?? "—").padEnd(30)} ← ${entity.slice(0, 30).padEnd(30)} ${String(permits(r)).padStart(4)}p  hs:[${axes.join(",") || "—"}]${hsName ? ` ⇒ ${hsName.slice(0, 24)}` : ""}${hsOwnerId ? " (owned)" : ""}`,
  );
}

// ---- scorecard ----
const enriched = results.filter((r) => r.discovered).length;
const inCrm = results.filter((r) => r.verdict === "in-crm").length;
const candidate = results.filter((r) => r.verdict === "name-candidate").length;
const netNew = results.filter((r) => r.verdict === "net-new").length;
const byDomain = results.filter((r) => r.hsAxes.includes("domain")).length;
const byPhone = results.filter((r) => r.hsAxes.includes("phone")).length;
const owned = results.filter((r) => r.verdict === "in-crm" && r.hsOwnerId).length;

console.log("\n──────── SCORECARD ────────");
console.log(`Enriched (verified domain) : ${enriched}/${results.length}`);
console.log(`HubSpot strong match       : ${inCrm}  (domain: ${byDomain}, phone: ${byPhone})`);
console.log(`  of which already owned by a rep: ${owned}`);
console.log(`Name-only candidates       : ${candidate}  (need confirmation before suppressing)`);
console.log(`NET-NEW (safe to cold-email): ${netNew}`);

writeFileSync(OUT, JSON.stringify(results, null, 2));
console.log(`\nFull detail → ${OUT}`);
