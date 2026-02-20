#!/usr/bin/env bun

process.env.SKIP_ENV_VALIDATION ??= "1";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";

type CliOptions = {
  source: "outreach" | "file";
  input?: string;
  limit: number;
  pageSize: number;
  concurrency: number;
  out: string;
};

type ProspectCandidate = {
  email: string;
  outreachProspectId: string;
  outreachOwnerId: string | null;
  outreachUpdatedAt: string | null;
};

type OwnerInfo = {
  id: string;
  name: string;
  email: string | null;
};

type DiagnosticStatus =
  | "in_sync"
  | "missing_cio_customer"
  | "missing_outreach_owner"
  | "owner_not_resolvable"
  | "missing_cio_assignment"
  | "mismatch"
  | "error";

type DiagnosticRecord = {
  email: string;
  status: DiagnosticStatus;
  reason: string;
  outreachProspectId: string;
  outreachUpdatedAt: string | null;
  outreachOwner: OwnerInfo | null;
  cioAssignment: {
    assignedBdrEmail: string | null;
    assignedBdrName: string | null;
    assignedBdrOutreachId: string | null;
  } | null;
  actionable: boolean;
  error?: string;
};

type DiagnosticReport = {
  generatedAt: string;
  source: CliOptions["source"];
  input?: string;
  options: {
    limit: number;
    pageSize: number;
    concurrency: number;
  };
  totals: {
    candidates: number;
    processed: number;
    actionable: number;
  };
  statusCounts: Record<string, number>;
  records: DiagnosticRecord[];
};

const CUSTOMER_IO_APP_KEY = process.env.CUSTOMER_IO_APP_KEY;
const CUSTOMER_IO_SITE_ID = process.env.CUSTOMER_IO_SITE_ID;
const CUSTOMER_IO_API_KEY = process.env.CUSTOMER_IO_API_KEY;

function getAppApiHeaders(): Record<string, string> {
  if (!CUSTOMER_IO_APP_KEY) {
    throw new Error("Missing CUSTOMER_IO_APP_KEY");
  }
  return {
    Authorization: `Bearer ${CUSTOMER_IO_APP_KEY}`,
    "Content-Type": "application/json",
  };
}

type CioCustomer = {
  id: string;
  email: string;
  assignedBdrEmail: string | null;
  assignedBdrName: string | null;
  assignedBdrOutreachId: string | null;
};

async function getCioCustomerByEmail(email: string): Promise<CioCustomer | null> {
  const search = await fetch(
    `https://api.customer.io/v1/customers?email=${encodeURIComponent(email)}`,
    {
      method: "GET",
      headers: getAppApiHeaders(),
    },
  );

  if (!search.ok) {
    throw new Error(`Customer.io search failed (${search.status}) for ${email}`);
  }

  const searchJson = (await search.json()) as {
    results?: Array<{ id: string; email: string }>;
  };
  const customer = searchJson.results?.[0];
  if (!customer) return null;

  const attrsRes = await fetch(
    `https://api.customer.io/v1/customers/${encodeURIComponent(customer.id)}/attributes`,
    {
      method: "GET",
      headers: getAppApiHeaders(),
    },
  );

  if (!attrsRes.ok) {
    throw new Error(
      `Customer.io attributes failed (${attrsRes.status}) for ${email}`,
    );
  }

  const attrsJson = (await attrsRes.json()) as {
    customer?: { attributes?: Record<string, unknown> };
  };
  const attrs = attrsJson.customer?.attributes ?? {};

  return {
    id: customer.id,
    email: customer.email,
    assignedBdrEmail:
      typeof attrs.assigned_bdr_email === "string"
        ? attrs.assigned_bdr_email
        : null,
    assignedBdrName:
      typeof attrs.assigned_bdr_name === "string"
        ? attrs.assigned_bdr_name
        : null,
    assignedBdrOutreachId:
      typeof attrs.assigned_bdr_outreach_id === "string"
        ? attrs.assigned_bdr_outreach_id
        : null,
  };
}

function parseArgs(argv: string[]): CliOptions {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token?.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args.set(key, "true");
      continue;
    }
    args.set(key, next);
    i += 1;
  }

  const sourceRaw = (args.get("source") ?? "outreach").toLowerCase();
  if (sourceRaw !== "outreach" && sourceRaw !== "file") {
    throw new Error(`Invalid --source '${sourceRaw}'. Use 'outreach' or 'file'.`);
  }

  const source = sourceRaw;
  const input = args.get("input");

  if (source === "file" && !input) {
    throw new Error("--input is required when --source file");
  }

  const limit = toInt(args.get("limit"), 500, 1, 20000);
  const pageSize = toInt(args.get("page-size"), 100, 1, 100);
  const concurrency = toInt(args.get("concurrency"), 5, 1, 25);

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const out = resolve(args.get("out") ?? `./reports/cio-assignment-diagnostic-${ts}.json`);

  return { source, input, limit, pageSize, concurrency, out };
}

function toInt(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function coercePrimitiveToString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "bigint") return String(value);
  if (typeof value === "boolean") return String(value);
  return null;
}

function parseOwnerId(relationships: unknown): string | null {
  if (!relationships || typeof relationships !== "object") return null;
  const owner = (relationships as Record<string, unknown>).owner;
  if (!owner || typeof owner !== "object") return null;
  const data = (owner as Record<string, unknown>).data;
  if (!data || Array.isArray(data) || typeof data !== "object") return null;
  const id = (data as Record<string, unknown>).id;
  return coercePrimitiveToString(id);
}

async function loadCandidatesFromOutreach(options: CliOptions): Promise<ProspectCandidate[]> {
  const outreach = await import("../server/clients/outreach.client");
  const seen = new Set<string>();
  const candidates: ProspectCandidate[] = [];

  let page = 1;
  while (candidates.length < options.limit) {
    const response = await outreach.getProspects({
      pageSize: options.pageSize,
      pageNumber: page,
      sort: "-updatedAt",
    });

    if (!response.data.length) break;

    for (const prospect of response.data) {
      const firstEmail = prospect.attributes.emails?.[0];
      if (!firstEmail) continue;
      const email = normalizeEmail(firstEmail);
      if (seen.has(email)) continue;

      seen.add(email);
      candidates.push({
        email,
        outreachProspectId: String(prospect.id),
        outreachOwnerId: parseOwnerId(prospect.relationships),
        outreachUpdatedAt: prospect.attributes.updatedAt ?? null,
      });

      if (candidates.length >= options.limit) break;
    }

    page += 1;
  }

  return candidates;
}

async function loadCandidatesFromFile(path: string, limit: number): Promise<ProspectCandidate[]> {
  const absolute = resolve(path);
  if (!existsSync(absolute)) {
    throw new Error(`Input file not found: ${absolute}`);
  }

  const raw = await readFile(absolute, "utf8");
  const trimmed = raw.trim();
  if (!trimmed) return [];

  if (absolute.endsWith(".json")) {
    const parsed = JSON.parse(trimmed) as unknown;
    const items = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { records?: unknown[] }).records)
        ? (parsed as { records: unknown[] }).records
        : [];

    const out: ProspectCandidate[] = [];
    const seen = new Set<string>();
    for (const row of items) {
      if (!row || typeof row !== "object") continue;
      const record = row as Record<string, unknown>;
      const emailRaw = record.email;
      if (typeof emailRaw !== "string") continue;
      const email = normalizeEmail(emailRaw);
      if (!email || seen.has(email)) continue;
      seen.add(email);

      out.push({
        email,
        outreachProspectId:
          coercePrimitiveToString(record.outreachProspectId) ??
          coercePrimitiveToString(record.prospectId) ??
          "unknown",
        outreachOwnerId:
          typeof record.outreachOwnerId === "string"
            ? record.outreachOwnerId
            : typeof (record.outreachOwner as { id?: unknown } | undefined)?.id === "string"
              ? ((record.outreachOwner as { id: string }).id)
              : null,
        outreachUpdatedAt:
          typeof record.outreachUpdatedAt === "string" ? record.outreachUpdatedAt : null,
      });

      if (out.length >= limit) break;
    }

    return out;
  }

  const lines = trimmed.split(/\r?\n/);
  if (!lines.length) return [];

  const header = lines[0]!.split(",").map((x) => x.trim().toLowerCase());
  const emailIdx = header.findIndex((h) => h === "email");
  const ownerIdx = header.findIndex((h) => h === "outreach_owner_id" || h === "owner_id");
  const prospectIdx = header.findIndex((h) => h === "outreach_prospect_id" || h === "prospect_id");
  const updatedIdx = header.findIndex((h) => h === "outreach_updated_at" || h === "updated_at");

  const out: ProspectCandidate[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < lines.length && out.length < limit; i++) {
    const row = lines[i];
    if (!row) continue;
    const cols = row.split(",");
    const emailRaw = emailIdx >= 0 ? cols[emailIdx] : cols[0];
    if (!emailRaw) continue;

    const email = normalizeEmail(emailRaw.replace(/^"|"$/g, ""));
    if (!email || seen.has(email)) continue;
    seen.add(email);

    const owner = ownerIdx >= 0 ? cols[ownerIdx]?.replace(/^"|"$/g, "").trim() : "";
    const prospectId = prospectIdx >= 0 ? cols[prospectIdx]?.replace(/^"|"$/g, "").trim() : "";
    const updatedAt = updatedIdx >= 0 ? cols[updatedIdx]?.replace(/^"|"$/g, "").trim() : "";

    out.push({
      email,
      outreachProspectId: prospectId || "unknown",
      outreachOwnerId: owner || null,
      outreachUpdatedAt: updatedAt || null,
    });
  }

  return out;
}

async function loadOwnerDirectory(ownerIds: string[]): Promise<Map<string, OwnerInfo>> {
  const outreach = await import("../server/clients/outreach.client");
  const target = new Set(ownerIds);
  const byId = new Map<string, OwnerInfo>();

  if (!target.size) return byId;

  let page = 1;
  while (true) {
    const usersResponse = await outreach.getUsers({ pageSize: 100, pageNumber: page });
    if (!usersResponse.data.length) break;

    for (const user of usersResponse.data) {
      const id = String(user.id);
      if (!target.has(id)) continue;
      byId.set(id, {
        id,
        name: user.attributes.name,
        email: user.attributes.email ? normalizeEmail(user.attributes.email) : null,
      });
    }

    if (byId.size >= target.size) break;
    page += 1;
  }

  return byId;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const output: Array<R | undefined> = Array.from({ length: items.length });
  let cursor = 0;

  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const idx = cursor;
      cursor += 1;
      if (idx >= items.length) return;
      output[idx] = await mapper(items[idx]!, idx);
    }
  });

  await Promise.all(workers);
  return output.map((value, idx) => {
    if (value === undefined) {
      throw new Error(`Missing mapped result at index ${idx}`);
    }
    return value;
  });
}

function buildStatusCounts(records: DiagnosticRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of records) {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
  }
  return counts;
}

async function ensureParentDir(filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
}

async function run(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (!CUSTOMER_IO_APP_KEY || !CUSTOMER_IO_SITE_ID || !CUSTOMER_IO_API_KEY) {
    throw new Error(
      "Missing Customer.io credentials (CUSTOMER_IO_APP_KEY, CUSTOMER_IO_SITE_ID, CUSTOMER_IO_API_KEY)",
    );
  }

  const candidates =
    options.source === "outreach"
      ? await loadCandidatesFromOutreach(options)
      : await loadCandidatesFromFile(options.input!, options.limit);

  const ownerIds = candidates
    .map((c) => c.outreachOwnerId)
    .filter((id): id is string => !!id);
  const ownerDirectory = await loadOwnerDirectory([...new Set(ownerIds)]);

  const records = await mapWithConcurrency(candidates, options.concurrency, async (candidate) => {
    try {
      if (!candidate.outreachOwnerId) {
        return {
          email: candidate.email,
          status: "missing_outreach_owner",
          reason: "Outreach prospect has no owner",
          outreachProspectId: candidate.outreachProspectId,
          outreachUpdatedAt: candidate.outreachUpdatedAt,
          outreachOwner: null,
          cioAssignment: null,
          actionable: false,
        } satisfies DiagnosticRecord;
      }

      const owner = ownerDirectory.get(candidate.outreachOwnerId);
      if (!owner) {
        return {
          email: candidate.email,
          status: "owner_not_resolvable",
          reason: `Outreach owner ${candidate.outreachOwnerId} not found in users directory`,
          outreachProspectId: candidate.outreachProspectId,
          outreachUpdatedAt: candidate.outreachUpdatedAt,
          outreachOwner: {
            id: candidate.outreachOwnerId,
            name: `Outreach User ${candidate.outreachOwnerId}`,
            email: null,
          },
          cioAssignment: null,
          actionable: false,
        } satisfies DiagnosticRecord;
      }

      const cioCustomer = await getCioCustomerByEmail(candidate.email);
      if (!cioCustomer) {
        return {
          email: candidate.email,
          status: "missing_cio_customer",
          reason: "No Customer.io customer for this email",
          outreachProspectId: candidate.outreachProspectId,
          outreachUpdatedAt: candidate.outreachUpdatedAt,
          outreachOwner: owner,
          cioAssignment: null,
          actionable: false,
        } satisfies DiagnosticRecord;
      }

      const cioAssignment = {
        assignedBdrEmail: cioCustomer.assignedBdrEmail
          ? normalizeEmail(cioCustomer.assignedBdrEmail)
          : null,
        assignedBdrName: cioCustomer.assignedBdrName,
        assignedBdrOutreachId: cioCustomer.assignedBdrOutreachId,
      };

      if (!cioAssignment.assignedBdrOutreachId && !cioAssignment.assignedBdrEmail) {
        return {
          email: candidate.email,
          status: "missing_cio_assignment",
          reason: "CIO has no BDR assignment fields",
          outreachProspectId: candidate.outreachProspectId,
          outreachUpdatedAt: candidate.outreachUpdatedAt,
          outreachOwner: owner,
          cioAssignment,
          actionable: !!owner.email,
        } satisfies DiagnosticRecord;
      }

      const outreachIdMismatch = cioAssignment.assignedBdrOutreachId !== owner.id;
      const emailMismatch =
        !!owner.email && !!cioAssignment.assignedBdrEmail
          ? cioAssignment.assignedBdrEmail !== owner.email
          : false;

      if (outreachIdMismatch || emailMismatch) {
        return {
          email: candidate.email,
          status: "mismatch",
          reason: `CIO assignment does not match Outreach owner (${outreachIdMismatch ? "owner_id" : ""}${outreachIdMismatch && emailMismatch ? "+" : ""}${emailMismatch ? "email" : ""})`,
          outreachProspectId: candidate.outreachProspectId,
          outreachUpdatedAt: candidate.outreachUpdatedAt,
          outreachOwner: owner,
          cioAssignment,
          actionable: !!owner.email,
        } satisfies DiagnosticRecord;
      }

      return {
        email: candidate.email,
        status: "in_sync",
        reason: "CIO assignment matches Outreach owner",
        outreachProspectId: candidate.outreachProspectId,
        outreachUpdatedAt: candidate.outreachUpdatedAt,
        outreachOwner: owner,
        cioAssignment,
        actionable: false,
      } satisfies DiagnosticRecord;
    } catch (error) {
      return {
        email: candidate.email,
        status: "error",
        reason: "Unexpected error during diagnostic",
        outreachProspectId: candidate.outreachProspectId,
        outreachUpdatedAt: candidate.outreachUpdatedAt,
        outreachOwner: candidate.outreachOwnerId
          ? {
              id: candidate.outreachOwnerId,
              name: `Outreach User ${candidate.outreachOwnerId}`,
              email: null,
            }
          : null,
        cioAssignment: null,
        actionable: false,
        error: error instanceof Error ? error.message : String(error),
      } satisfies DiagnosticRecord;
    }
  });

  const report: DiagnosticReport = {
    generatedAt: new Date().toISOString(),
    source: options.source,
    input: options.input,
    options: {
      limit: options.limit,
      pageSize: options.pageSize,
      concurrency: options.concurrency,
    },
    totals: {
      candidates: candidates.length,
      processed: records.length,
      actionable: records.filter((r) => r.actionable).length,
    },
    statusCounts: buildStatusCounts(records),
    records,
  };

  await ensureParentDir(options.out);
  await writeFile(options.out, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("CIO assignment diagnostic complete");
  console.log(`  source: ${options.source}`);
  console.log(`  candidates: ${report.totals.candidates}`);
  console.log(`  actionable: ${report.totals.actionable}`);
  console.log(`  out: ${options.out}`);
  console.log(`  statusCounts: ${JSON.stringify(report.statusCounts)}`);
}

run().catch((error) => {
  console.error("diagnose-cio-assignment failed:", error);
  process.exitCode = 1;
});
