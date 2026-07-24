/**
 * Stream the full HubSpot company export into the Growth domain projection.
 *
 * The July export expands to ~512 MB and contains quoted multiline cells, so
 * the generic in-memory CSV importer is intentionally not used here. This
 * script streams directly from the ZIP, batches writes, and is safe to rerun:
 * an older export cannot overwrite a company row advanced by a newer export or
 * webhook event.
 *
 * Dry run (default):
 *   bun --conditions=react-server scripts/import-hubspot-company-export.ts \
 *     ~/Downloads/hubspot-crm-exports-all-companies-2026-07-09.zip
 *
 * Apply:
 *   bun --conditions=react-server scripts/import-hubspot-company-export.ts \
 *     --apply ~/Downloads/hubspot-crm-exports-all-companies-2026-07-09.zip
 */
import { createReadStream, existsSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

import { parse } from "csv-parse";
import { sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  leadDomainTable,
  leadImportTable,
  type LeadEnrichment,
} from "@/server/db/leads-schema";

type ExportRow = Record<string, string | undefined>;
type DomainInsert = typeof leadDomainTable.$inferInsert;

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const limitArg = argv.find((arg) => arg.startsWith("--limit="));
const batchArg = argv.find((arg) => arg.startsWith("--batch-size="));
const inputArg = argv.find((arg) => !arg.startsWith("--"));
const inputPath = resolve(
  inputArg ??
    `${homedir()}/Downloads/hubspot-crm-exports-all-companies-2026-07-09.zip`,
);
const limit = limitArg
  ? Number(limitArg.split("=")[1])
  : Number.POSITIVE_INFINITY;
const batchSize = batchArg ? Number(batchArg.split("=")[1]) : 500;

if (!existsSync(inputPath)) {
  throw new Error(`HubSpot export not found: ${inputPath}`);
}
if (!Number.isFinite(batchSize) || batchSize < 1 || batchSize > 1_000) {
  throw new Error("--batch-size must be between 1 and 1000");
}
if (!(limit > 0)) throw new Error("--limit must be greater than zero");

function clean(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeDomain(value: string | undefined): string | null {
  if (!value) return null;
  let domain = value.trim().toLowerCase();
  if (!domain) return null;
  if (domain.includes("://")) domain = domain.split("://")[1]!;
  if (domain.includes("@")) domain = domain.split("@").pop()!;
  for (const separator of ["/", "?", "#"]) {
    if (domain.includes(separator)) domain = domain.split(separator)[0]!;
  }
  if (domain.includes(":")) domain = domain.split(":")[0]!;
  while (domain.startsWith("www.")) domain = domain.slice(4);
  domain = domain.replace(/^\.+|\.+$/g, "").trim();
  return domain || null;
}

function toInteger(value: string | undefined): number | null {
  if (!value) return null;
  const number = Number(value.replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) ? Math.round(number) : null;
}

function toDate(value: string | undefined): Date | null {
  const normalized = clean(value);
  if (!normalized) return null;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isTrue(value: string | undefined): boolean {
  return /^(true|yes|1)$/i.test(value?.trim() ?? "");
}

function normalizePms(value: string | undefined): string | null {
  const pms = clean(value);
  if (!pms || /^your pms$/i.test(pms)) return null;
  return pms;
}

function hasDeal(row: ExportRow): boolean {
  const count = toInteger(row["Number of Associated Deals"]);
  return (count ?? 0) > 0 || Boolean(clean(row["Associated Deal IDs"]));
}

function isCustomer(row: ExportRow): boolean {
  if (isTrue(row["Current Customer"])) return true;
  return /^(closed won|customer|wander customer)/i.test(
    clean(row["Lead Status"]) ?? "",
  );
}

function toDomainInsert(row: ExportRow, syncedAt: Date): DomainInsert | null {
  const domain = normalizeDomain(row["Company Domain Name"]);
  const recordId = clean(row["Record ID"]);
  if (!domain || !recordId) return null;

  const compactSnapshot = {
    recordId,
    lifecycleStage: clean(row["Lifecycle Stage"]),
    inboundOutbound: clean(row["Inbound/Outbound"]),
    rentalType: clean(row["Rental Type"]),
    website: clean(row["Website URL"]),
    phone: clean(row["Phone Number"]),
    contactCount: toInteger(row["Number of Associated Contacts"]),
    dealCount: toInteger(row["Number of Associated Deals"]),
    source: clean(row["Record source"]),
    exportLastModifiedAt: clean(row["Last Modified Date"]),
  };

  return {
    domain,
    companyName: clean(row["Company name"]),
    city: clean(row.City),
    state: clean(row["State/Region"]),
    country: clean(row["Country/Region"]),
    pms: normalizePms(row["PMS (AI Identified)"]),
    unitCount:
      toInteger(row["Portfolio Size"]) ??
      toInteger(row["# of WW Properties (estimate)"]),
    websiteQuality: clean(row["Website Quality"]),
    pregenSiteUrl: clean(row["Sites Preview URL"]),
    hubspotRecordId: recordId,
    hubspotLeadStatus: clean(row["Lead Status"]),
    hubspotOwner: clean(row["Company owner"]),
    hubspotSyncedAt: syncedAt,
    hubspotLastModifiedAt: toDate(row["Last Modified Date"]),
    outreachLink: clean(row["Outreach Link"]),
    hasHubspotDeal: hasDeal(row),
    isExistingCustomer: isCustomer(row),
    inHubspot: true,
    enrichment: {
      hubspot: compactSnapshot,
    } satisfies LeadEnrichment,
  };
}

function sourceStream(path: string) {
  if (extname(path).toLowerCase() !== ".zip") return createReadStream(path);
  const child = spawn("unzip", ["-p", path], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  child.on("exit", (code) => {
    if (code !== 0) {
      child.stdout.destroy(new Error(`unzip exited with status ${code}`));
    }
  });
  return child.stdout;
}

async function sha256(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path))
    hash.update(chunk as Buffer);
  return hash.digest("hex");
}

async function writeBatch(values: DomainInsert[]): Promise<void> {
  if (!values.length) return;

  // PostgreSQL cannot update the same conflict target twice in one INSERT.
  // Collapse duplicate domains inside the batch using the same newest-record
  // rule used across batches.
  const newestByDomain = new Map<string, DomainInsert>();
  for (const value of values) {
    const existing = newestByDomain.get(value.domain);
    const existingTime = existing?.hubspotLastModifiedAt?.getTime() ?? 0;
    const candidateTime = value.hubspotLastModifiedAt?.getTime() ?? 0;
    if (!existing || candidateTime >= existingTime) {
      newestByDomain.set(value.domain, value);
    }
  }

  // A duplicate domain can occur in different batches. The newest HubSpot
  // modified record wins deterministically; equal timestamps make reruns safe.
  await db
    .insert(leadDomainTable)
    .values([...newestByDomain.values()])
    .onConflictDoUpdate({
      target: leadDomainTable.domain,
      set: {
        companyName: sql`coalesce(excluded.company_name, ${leadDomainTable.companyName})`,
        city: sql`coalesce(excluded.city, ${leadDomainTable.city})`,
        state: sql`coalesce(excluded.state, ${leadDomainTable.state})`,
        country: sql`coalesce(excluded.country, ${leadDomainTable.country})`,
        pms: sql`coalesce(excluded.pms, ${leadDomainTable.pms})`,
        unitCount: sql`coalesce(excluded.unit_count, ${leadDomainTable.unitCount})`,
        websiteQuality: sql`coalesce(excluded.website_quality, ${leadDomainTable.websiteQuality})`,
        pregenSiteUrl: sql`coalesce(excluded.pregen_site_url, ${leadDomainTable.pregenSiteUrl})`,
        hubspotRecordId: sql`excluded.hubspot_record_id`,
        hubspotLeadStatus: sql`excluded.hubspot_lead_status`,
        hubspotOwner: sql`excluded.hubspot_owner`,
        hubspotSyncedAt: sql`excluded.hubspot_synced_at`,
        hubspotLastModifiedAt: sql`excluded.hubspot_last_modified_at`,
        outreachLink: sql`excluded.outreach_link`,
        hasHubspotDeal: sql`excluded.has_hubspot_deal`,
        isExistingCustomer: sql`excluded.is_existing_customer`,
        inHubspot: true,
        enrichment: sql`coalesce(${leadDomainTable.enrichment}, '{}'::jsonb)
          || jsonb_build_object('hubspot', excluded.enrichment -> 'hubspot')`,
        updatedAt: new Date(),
      },
      setWhere: sql`${leadDomainTable.hubspotLastModifiedAt} is null
        or excluded.hubspot_last_modified_at is null
        or ${leadDomainTable.hubspotLastModifiedAt} <= excluded.hubspot_last_modified_at`,
    });
}

const startedAt = new Date();
const fingerprint = await sha256(inputPath);
const domains = new Set<string>();
const duplicateDomains = new Set<string>();
let rowsSeen = 0;
let eligibleRows = 0;
let blankDomainRows = 0;
let missingRecordIdRows = 0;
let batchesWritten = 0;
let batch: DomainInsert[] = [];

console.log(
  JSON.stringify(
    {
      mode: apply ? "apply" : "dry-run",
      input: inputPath,
      sha256: fingerprint,
      batchSize,
      limit: Number.isFinite(limit) ? limit : null,
    },
    null,
    2,
  ),
);

const parser = sourceStream(inputPath).pipe(
  parse({
    bom: true,
    columns: true,
    relax_column_count: true,
    relax_quotes: true,
    skip_empty_lines: true,
  }),
);

for await (const rawRow of parser) {
  if (rowsSeen >= limit) break;
  rowsSeen += 1;
  const row = rawRow as ExportRow;
  const domain = normalizeDomain(row["Company Domain Name"]);
  const recordId = clean(row["Record ID"]);
  if (!domain) {
    blankDomainRows += 1;
    continue;
  }
  if (!recordId) {
    missingRecordIdRows += 1;
    continue;
  }
  if (domains.has(domain)) duplicateDomains.add(domain);
  domains.add(domain);

  const value = toDomainInsert(row, startedAt);
  if (!value) continue;
  eligibleRows += 1;
  if (!apply) continue;

  batch.push(value);
  if (batch.length >= batchSize) {
    await writeBatch(batch);
    batchesWritten += 1;
    batch = [];
    if (batchesWritten % 50 === 0) {
      console.log(
        JSON.stringify({
          progress: rowsSeen,
          eligibleRows,
          batchesWritten,
        }),
      );
    }
  }
}

if (apply && batch.length) {
  await writeBatch(batch);
  batchesWritten += 1;
}

const result = {
  mode: apply ? "apply" : "dry-run",
  filename: basename(inputPath),
  sha256: fingerprint,
  rowsSeen,
  eligibleRows,
  distinctDomains: domains.size,
  duplicateDomainCount: duplicateDomains.size,
  blankDomainRows,
  missingRecordIdRows,
  batchesWritten,
  durationSeconds: Math.round((Date.now() - startedAt.getTime()) / 1000),
};

if (apply) {
  await db.insert(leadImportTable).values({
    filename: basename(inputPath),
    source: "hubspot",
    rowCount: rowsSeen,
    domainsSeen: domains.size,
    domainsUpdated: eligibleRows,
    notes: JSON.stringify({
      importer: "import-hubspot-company-export.ts",
      sha256: fingerprint,
      duplicateDomainCount: duplicateDomains.size,
      blankDomainRows,
      missingRecordIdRows,
    }),
  });
}

console.log(JSON.stringify(result, null, 2));
