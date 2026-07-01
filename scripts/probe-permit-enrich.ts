/**
 * LOCAL PROBE — gauge the full enrichment stack on Brian's government-permit PM
 * list, BEFORE any DB ingest. Reads ~/Downloads/pm_companies.csv (no Neon
 * writes) and per company runs:
 *   1. domain-discovery (layered: providers → verify gate) — name → verified site
 *   2. channel resolution (resolveContactChannel) — reachable email/form
 *   3. contact trust-layer (verifyContactPerson) — Minerva geo (+ LinkedIn)
 *
 * Rows that already have a domain are included as a blind ground-truth check.
 *
 * Run:  bun --conditions react-server scripts/probe-permit-enrich.ts [N]
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";

import { discoverDomain } from "@/server/services/domain-discovery.service";
import { resolveContactChannel } from "@/server/services/lead-channel.service";
import { verifyContactPerson } from "@/server/services/lead-verify.service";

const CSV = join(homedir(), "Downloads", "pm_companies.csv");
const OUT =
  "/private/tmp/claude-501/-Users-kristianeboe-Developer-wander-growth/97f22627-49a1-491b-a471-78b31d2fd584/scratchpad/permit-probe-report.json";
const N = parseInt(process.argv[2] ?? "40", 10);

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "", row: string[] = [], inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift() ?? [];
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

const cleanCity = (m: string) => (m.split("(")[0]?.split("/")[0] ?? m).trim();
const sld = (d: string) => d.split(".").slice(-2, -1)[0] ?? d;
const ROLE = /^(info|hello|contact|admin|office|team|stay|book|bookings|reservations|sales|rentals|owner|support)@/i;

const all = parseCsv(readFileSync(CSV, "utf8"));
const permits = (r: Record<string, string>) => parseInt(r.permits || "0", 10) || 0;
const nKnown = Math.max(1, Math.round(N * 0.25));

const known = all.filter((r) => (r.website || "").trim()).sort((a, b) => permits(b) - permits(a)).slice(0, nKnown);
const unknownAll = all.filter((r) => !(r.website || "").trim()).sort((a, b) => permits(b) - permits(a));
const nUnknown = N - known.length;
const unknown = Array.from({ length: nUnknown }, (_, k) =>
  unknownAll[Math.round((k * (unknownAll.length - 1)) / Math.max(1, nUnknown - 1))],
).filter((r): r is Record<string, string> => Boolean(r));
const sample = [...known, ...unknown];

console.log(`Probing ${sample.length} PM companies (${known.length} ground-truth + ${unknown.length} unknown)\n`);

type Row = {
  entity: string; permits: number; market: string; state: string;
  knownDomain: string; discovered: string | null; confidence: string;
  evidence: string[]; reasoning: string; groundTruthMatch: boolean | null;
  route: string | null; bestEmail: string | null; corporateEmail: boolean;
  verifiedEmail: string | null; geoMatch: string | null; minervaCity: string | null;
};
const results: Row[] = [];

for (const r of sample) {
  const entity = r.entity_name ?? "";
  const market = r.market ?? "";
  const state = r.state ?? "";
  const city = cleanCity(market);
  const knownDomain = (r.website ?? "").trim().toLowerCase().replace(/^www\./, "");

  const disc = await discoverDomain({
    name: entity,
    city,
    state,
    phone: r.phone || null,
    knownEmail: r.email || null,
  });

  let route: string | null = null, bestEmail: string | null = null, corporateEmail = false;
  let verifiedEmail: string | null = null, geoMatch: string | null = null, minervaCity: string | null = null;

  if (disc.domain) {
    try {
      const ch = await resolveContactChannel({ domain: disc.domain, companyName: entity });
      route = ch.route; bestEmail = ch.bestEmail; corporateEmail = ch.corporate.length > 0;
    } catch {}

    // contact trust-layer on the most resolvable email (prefer a named permit
    // email over a role inbox), only for confirmed domains (cost control).
    if (disc.confidence === "high") {
      const permitEmail = (r.email ?? "").trim().toLowerCase();
      const emailToCheck = permitEmail && !ROLE.test(permitEmail) ? permitEmail : bestEmail;
      if (emailToCheck) {
        try {
          const v = await verifyContactPerson({
            email: emailToCheck,
            company: { name: entity, domain: disc.domain, city, state, country: "US" },
          });
          if (v) { verifiedEmail = emailToCheck; geoMatch = v.geoMatch; minervaCity = v.minerva?.city ?? null; }
        } catch {}
      }
    }
  }

  const groundTruthMatch = knownDomain
    ? disc.domain === knownDomain || (!!disc.domain && sld(disc.domain) === sld(knownDomain))
    : null;

  results.push({
    entity, permits: permits(r), market, state,
    knownDomain, discovered: disc.domain, confidence: disc.confidence,
    evidence: disc.evidence, reasoning: disc.reasoning,
    groundTruthMatch, route, bestEmail, corporateEmail, verifiedEmail, geoMatch, minervaCity,
  });

  const gt = groundTruthMatch === null ? "" : groundTruthMatch ? "  ✓GT" : "  ✗GT";
  const geo = geoMatch ? `  geo:${geoMatch}` : "";
  console.log(
    `${disc.confidence.padEnd(6)} ${(disc.domain ?? "—").padEnd(30)} ← ${entity.slice(0, 30).padEnd(30)} ${String(permits(r)).padStart(5)}p ${corporateEmail ? "corp-email" : bestEmail ? "email" : route ?? ""}${gt}${geo}`,
  );
}

// ---- scorecard ----
const conf = (c: string) => results.filter((r) => r.confidence === c).length;
const usable = results.filter((r) => r.discovered);
const gtRows = results.filter((r) => r.groundTruthMatch !== null);
const gtHit = gtRows.filter((r) => r.groundTruthMatch).length;
const gtFalsePos = gtRows.filter((r) => r.discovered && !r.groundTruthMatch).length;
const unknownRows = results.filter((r) => r.groundTruthMatch === null);
const unknownFound = unknownRows.filter((r) => r.discovered).length;
const coldReady = usable.filter((r) => r.corporateEmail || r.bestEmail).length;
const geoRows = results.filter((r) => r.geoMatch);

console.log("\n──────── SCORECARD ────────");
console.log(`confidence: high ${conf("high")} · medium ${conf("medium")} · none ${conf("none")}`);
console.log(`Ground-truth precision : ${gtHit}/${gtRows.length} matched known domain  (false-positive picks: ${gtFalsePos})`);
console.log(`Domain recovery (unknown): ${unknownFound}/${unknownRows.length} got a verified domain`);
console.log(`Cold-email-ready       : ${coldReady}/${usable.length} of found domains had a reachable email (corp: ${usable.filter((r) => r.corporateEmail).length})`);
console.log(`Contact trust-layer    : ran on ${geoRows.length} · geo match ${geoRows.filter((r) => r.geoMatch === "match").length} · mismatch ${geoRows.filter((r) => r.geoMatch === "mismatch").length} · unknown ${geoRows.filter((r) => r.geoMatch === "unknown").length}`);

writeFileSync(OUT, JSON.stringify(results, null, 2));
console.log(`\nFull detail → ${OUT}`);
