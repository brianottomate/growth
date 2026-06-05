/**
 * ingest-leads.ts — load the prospecting CSVs into leads.* (Neon).
 *
 * Domain-centric: every file upserts the `leads.domain` spine on the
 * normalized domain; instantly uploads also upsert `leads.contact`. Idempotent
 * (re-runnable) and dry-run by default.
 *
 *   bun scripts/ingest-leads.ts                 # dry run, default ~/Downloads files
 *   bun scripts/ingest-leads.ts --commit        # actually write
 *   bun scripts/ingest-leads.ts --commit a.csv  # specific file(s)
 *   bun scripts/ingest-leads.ts --tier1         # also ingest the tier1 subset
 *
 * Source is auto-detected from the header signature.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  leadContactTable,
  leadDomainTable,
  leadImportTable,
  type LeadSource,
} from "@/server/db/leads-schema";

// ---- args ----------------------------------------------------------

const argv = process.argv.slice(2);
const COMMIT = argv.includes("--commit");
const INCLUDE_TIER1 = argv.includes("--tier1");
const fileArgs = argv.filter((a) => !a.startsWith("--"));

const DEFAULT_FILES = [
  "builtwith_domains_for_minerva.csv",
  "all-pm-companies.csv",
  "pregen_sites_for_team.csv",
  "instantly_upload_all.csv",
  ...(INCLUDE_TIER1 ? ["instantly_upload_tier1.csv"] : []),
].map((f) => join(homedir(), "Downloads", f));

const files = fileArgs.length ? fileArgs : DEFAULT_FILES;

// ---- minimal RFC-4180 CSV parser (no deps) -------------------------

type Row = Record<string, string>;

function parseCsv(text: string): Row[] {
  // strip BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      record.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      record.push(field);
      field = "";
      // skip blank lines
      if (record.length > 1 || record[0] !== "") records.push(record);
      record = [];
    } else field += ch;
  }
  if (field !== "" || record.length) {
    record.push(field);
    if (record.length > 1 || record[0] !== "") records.push(record);
  }
  if (!records.length) return [];
  const headers = records[0]!.map((h) => h.trim());
  return records.slice(1).map((cells) => {
    const obj: Row = {};
    headers.forEach((h, idx) => (obj[h] = cells[idx] ?? ""));
    return obj;
  });
}

// ---- domain normalization (mirrors scripts/domain-audit.py) --------

function normalizeDomain(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let d = raw.trim().toLowerCase();
  if (!d) return null;
  if (d.includes("://")) d = d.split("://")[1]!;
  if (d.includes("@")) d = d.split("@").pop()!;
  for (const sep of ["/", "?", "#"]) if (d.includes(sep)) d = d.split(sep)[0]!;
  if (d.includes(":")) d = d.split(":")[0]!;
  while (d.startsWith("www.")) d = d.slice(4);
  d = d.replace(/^\.+|\.+$/g, "").trim();
  return d || null;
}

const toInt = (v: string | undefined): number | null => {
  if (!v) return null;
  // tolerate decimals ("41.0") and thousands separators ("1,759")
  const n = parseFloat(v.replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : null;
};
const clean = (v: string | undefined): string | null => {
  const s = v?.trim();
  return s ? s : null;
};

// ---- source detection from header ----------------------------------

function detectSource(headers: string[]): LeadSource {
  const h = new Set(headers.map((x) => x.trim().toLowerCase()));
  if (h.has("platforms") && h.has("is_integrated_pms")) return "builtwith";
  if (h.has("company domain name") || h.has("record id")) return "hubspot";
  if (h.has("page_title") && h.has("status")) return "pregen";
  if (h.has("email") && h.has("pregen_site_url")) return "instantly_upload";
  if (h.has("email")) return "instantly_upload";
  return "other";
}

// ---- per-source row → partial domain mappers -----------------------
// Each returns the columns this source is authoritative for. Undefined keys
// are left untouched on update so sources don't clobber each other.

type DomainPatch = Partial<typeof leadDomainTable.$inferInsert>;

function mapBuiltwith(r: Row): DomainPatch {
  const platforms = (r.platforms ?? "")
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean);
  return {
    companyName: clean(r.company),
    country: clean(r.country),
    state: clean(r.state),
    city: clean(r.city),
    pms: platforms[0] ?? null,
    platforms: platforms.length ? platforms : null,
    platformCount: toInt(r.platform_count),
    isIntegratedPms: /^true$/i.test(r.is_integrated_pms ?? ""),
    inBuiltwith: true,
  };
}

function mapHubspot(r: Row): DomainPatch {
  const hasDeal = !!clean(r["Associated Deal"]) || !!clean(r["Associated Deal IDs"]);
  return {
    companyName: clean(r["Company name"]),
    hubspotRecordId: clean(r["Record ID"]),
    hubspotLeadStatus: clean(r["Lead Status"]),
    hubspotOwner: clean(r["Company owner"]),
    outreachLink: clean(r["Outreach Link"]),
    pms: clean(r["PMS (AI Identified)"]),
    websiteQuality: clean(r["Website Quality"]),
    unitCount: toInt(r["Portfolio Size"]),
    hasHubspotDeal: hasDeal,
    inHubspot: true,
  };
}

function mapPregen(r: Row): DomainPatch {
  return {
    companyName: clean(r.company),
    sourceTier: clean(r.tier),
    unitCount: toInt(r.property_count),
    pregenStatus: clean(r.status),
    pregenPageTitle: clean(r.page_title),
    inPregen: true,
  };
}

function mapInstantlyDomain(r: Row): DomainPatch {
  return {
    companyName: clean(r.company_name),
    state: clean(r.state),
    pregenSiteUrl: clean(r.pregen_site_url),
    sourceTier: clean(r.tier),
    unitCount: toInt(r.property_count),
    inInstantly: true,
  };
}

// ---- ingest one file -----------------------------------------------

async function ingestFile(path: string) {
  const text = readFileSync(path, "utf8");
  const rows = parseCsv(text);
  const headers = rows.length ? Object.keys(rows[0]!) : [];
  const source = detectSource(headers);
  const filename = path.split("/").pop()!;

  // Collapse to one patch per domain (last-write-wins within the file), and
  // collect contacts for instantly uploads.
  const domainPatches = new Map<string, DomainPatch>();
  const contacts: { domain: string; row: Row }[] = [];

  for (const r of rows) {
    const domainCol =
      source === "hubspot" ? r["Company Domain Name"] : r.domain;
    const domain = normalizeDomain(domainCol);
    if (!domain) continue;

    let patch: DomainPatch;
    if (source === "builtwith") patch = mapBuiltwith(r);
    else if (source === "hubspot") patch = mapHubspot(r);
    else if (source === "pregen") patch = mapPregen(r);
    else if (source === "instantly_upload") {
      patch = mapInstantlyDomain(r);
      const email = clean(r.email)?.toLowerCase();
      if (email) contacts.push({ domain, row: r });
    } else patch = {};

    const prev = domainPatches.get(domain) ?? { domain };
    domainPatches.set(domain, mergePatch(prev, patch, source));
  }

  const summary = {
    filename,
    source,
    rowCount: rows.length,
    domainsSeen: domainPatches.size,
    contacts: contacts.length,
  };

  if (!COMMIT) {
    console.log(
      `  [dry] ${filename}  source=${source}  rows=${rows.length}  ` +
        `domains=${domainPatches.size}  contacts=${contacts.length}`,
    );
    const sample = [...domainPatches.values()][0];
    if (sample) console.log("        sample domain patch:", sample);
    return summary;
  }

  // ---- write (chunked upserts) ----
  let domainsWritten = 0;
  const patches = [...domainPatches.values()];
  for (let i = 0; i < patches.length; i += 500) {
    const chunk = patches.slice(i, i + 500);
    await db
      .insert(leadDomainTable)
      // every patch carries `domain` (set as the map base); TS only sees Partial.
      .values(chunk as (typeof leadDomainTable.$inferInsert)[])
      .onConflictDoUpdate({
        target: leadDomainTable.domain,
        set: buildDomainUpdateSet(),
      });
    domainsWritten += chunk.length;
  }

  // domain.id lookup for contacts
  let contactsWritten = 0;
  if (contacts.length) {
    const idByDomain = new Map<string, string>();
    const domainsForContacts = [...new Set(contacts.map((c) => c.domain))];
    for (let i = 0; i < domainsForContacts.length; i += 1000) {
      const chunk = domainsForContacts.slice(i, i + 1000);
      const found = await db
        .select({ id: leadDomainTable.id, domain: leadDomainTable.domain })
        .from(leadDomainTable)
        .where(sql`${leadDomainTable.domain} in ${chunk}`);
      for (const f of found) idByDomain.set(f.domain, f.id);
    }

    const contactValues = contacts
      .map((c) => {
        const domainId = idByDomain.get(c.domain);
        if (!domainId) return null;
        const r = c.row;
        return {
          domainId,
          domain: c.domain,
          email: clean(r.email)!.toLowerCase(),
          firstName: clean(r.first_name),
          lastName: clean(r.last_name),
          jobTitle: clean(r.job_title),
          phone: clean(r.phone),
          state: clean(r.state),
          source: "instantly_upload" as const,
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);

    for (let i = 0; i < contactValues.length; i += 500) {
      const chunk = contactValues.slice(i, i + 500);
      await db
        .insert(leadContactTable)
        .values(chunk)
        .onConflictDoUpdate({
          target: [leadContactTable.domain, leadContactTable.email],
          set: {
            firstName: sql`excluded.first_name`,
            lastName: sql`excluded.last_name`,
            jobTitle: sql`excluded.job_title`,
            phone: sql`excluded.phone`,
            updatedAt: new Date(),
          },
        });
      contactsWritten += chunk.length;
    }
  }

  await db.insert(leadImportTable).values({
    filename,
    source,
    rowCount: rows.length,
    domainsSeen: domainPatches.size,
    domainsCreated: 0, // upsert — exact split needs a pre-count; counts below are "touched"
    domainsUpdated: domainsWritten,
    contactsCreated: 0,
    contactsUpdated: contactsWritten,
    notes: "ingest-leads.ts",
  });

  console.log(
    `  ✓ ${filename}  source=${source}  domains touched=${domainsWritten}  contacts touched=${contactsWritten}`,
  );
  return { ...summary, domainsWritten, contactsWritten };
}

// Merge two patches; only let a key be overwritten by a non-nullish value, and
// OR the boolean presence flags so earlier sources' flags survive.
function mergePatch(
  prev: DomainPatch,
  next: DomainPatch,
  _source: LeadSource,
): DomainPatch {
  const out: DomainPatch = { ...prev };
  for (const [k, v] of Object.entries(next) as [keyof DomainPatch, unknown][]) {
    if (v === null || v === undefined) continue;
    if (typeof v === "boolean") {
      out[k] = (out[k] || v) as never;
    } else {
      out[k] = v as never;
    }
  }
  return out;
}

// On conflict, COALESCE so a new source fills gaps without nuking existing
// values; presence flags OR together.
function buildDomainUpdateSet() {
  const coalesce = (col: string) => sql.raw(`coalesce(excluded.${col}, leads.domain.${col})`);
  const orFlag = (col: string) => sql.raw(`(leads.domain.${col} or excluded.${col})`);
  return {
    companyName: coalesce("company_name"),
    country: coalesce("country"),
    state: coalesce("state"),
    city: coalesce("city"),
    pms: coalesce("pms"),
    platforms: coalesce("platforms"),
    platformCount: coalesce("platform_count"),
    isIntegratedPms: coalesce("is_integrated_pms"),
    unitCount: coalesce("unit_count"),
    websiteQuality: coalesce("website_quality"),
    pregenSiteUrl: coalesce("pregen_site_url"),
    pregenStatus: coalesce("pregen_status"),
    pregenPageTitle: coalesce("pregen_page_title"),
    hubspotRecordId: coalesce("hubspot_record_id"),
    hubspotLeadStatus: coalesce("hubspot_lead_status"),
    hubspotOwner: coalesce("hubspot_owner"),
    outreachLink: coalesce("outreach_link"),
    sourceTier: coalesce("source_tier"),
    hasHubspotDeal: orFlag("has_hubspot_deal"),
    inBuiltwith: orFlag("in_builtwith"),
    inHubspot: orFlag("in_hubspot"),
    inPregen: orFlag("in_pregen"),
    inInstantly: orFlag("in_instantly"),
    updatedAt: new Date(),
  };
}

// ---- main ----------------------------------------------------------

async function main() {
  console.log(
    `\n${COMMIT ? "COMMIT" : "DRY RUN"} — ingesting ${files.length} file(s)\n`,
  );
  // Domain-bearing sources first so instantly contacts find their domain row.
  const ordered = [...files].sort((a, b) => order(a) - order(b));
  for (const f of ordered) {
    try {
      await ingestFile(f);
    } catch (e) {
      console.error(`  ! ${f}:`, e instanceof Error ? e.message : e);
    }
  }
  if (COMMIT) {
    const res = await db.execute(
      sql`select (select count(*) from leads.domain) as d, (select count(*) from leads.contact) as c`,
    );
    const row = (Array.isArray(res) ? res : (res.rows ?? []))[0] as
      | { d: number; c: number }
      | undefined;
    console.log(`\nTotals now → domains: ${row?.d ?? "?"}  contacts: ${row?.c ?? "?"}`);
  } else {
    console.log("\n(dry run — pass --commit to write)");
  }
  process.exit(0);
}

function order(path: string): number {
  if (path.includes("builtwith")) return 0;
  if (path.includes("pm-companies") || path.includes("hubspot")) return 1;
  if (path.includes("pregen_sites")) return 2;
  return 3; // instantly uploads last
}

void main();
