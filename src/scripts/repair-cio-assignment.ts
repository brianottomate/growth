#!/usr/bin/env bun

process.env.SKIP_ENV_VALIDATION ??= "1";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";

type CliOptions = {
  input: string;
  apply: boolean;
  concurrency: number;
  limit?: number;
  out: string;
};

type DiagnosticRecord = {
  email: string;
  status: string;
  reason: string;
  actionable: boolean;
  outreachOwner: {
    id: string;
    name: string;
    email: string | null;
  } | null;
  cioAssignment: {
    assignedBdrEmail: string | null;
    assignedBdrName: string | null;
    assignedBdrOutreachId: string | null;
  } | null;
};

type RepairResult = {
  email: string;
  status: "updated" | "unchanged" | "skipped" | "error";
  reason: string;
  outreachOwner: {
    id: string;
    name: string;
    email: string | null;
  } | null;
  cioBefore: {
    assigned_bdr_email: string | null;
    assigned_bdr_name: string | null;
    assigned_bdr_outreach_id: string | null;
  } | null;
  cioAfter: {
    assigned_bdr_email: string | null;
    assigned_bdr_name: string | null;
    assigned_bdr_outreach_id: string | null;
  } | null;
  error?: string;
};

type RepairReport = {
  generatedAt: string;
  mode: "dry-run" | "apply";
  input: string;
  options: {
    concurrency: number;
    limit?: number;
  };
  totals: {
    candidates: number;
    processed: number;
    updated: number;
    unchanged: number;
    skipped: number;
    error: number;
  };
  results: RepairResult[];
};

const CUSTOMER_IO_SITE_ID = process.env.CUSTOMER_IO_SITE_ID;
const CUSTOMER_IO_API_KEY = process.env.CUSTOMER_IO_API_KEY;

function getTrackHeaders(): Record<string, string> {
  if (!CUSTOMER_IO_SITE_ID || !CUSTOMER_IO_API_KEY) {
    throw new Error(
      "Missing CUSTOMER_IO_SITE_ID or CUSTOMER_IO_API_KEY for Customer.io Track API",
    );
  }

  const auth = Buffer.from(
    `${CUSTOMER_IO_SITE_ID}:${CUSTOMER_IO_API_KEY}`,
  ).toString("base64");

  return {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
  };
}

async function updateCioBdrAssignment(params: {
  customerEmail: string;
  bdrEmail: string;
  bdrName: string;
  bdrOutreachId: string;
}): Promise<void> {
  const response = await fetch(
    `https://track.customer.io/api/v1/customers/${encodeURIComponent(params.customerEmail)}`,
    {
      method: "PUT",
      headers: getTrackHeaders(),
      body: JSON.stringify({
        email: params.customerEmail,
        assigned_bdr_email: params.bdrEmail,
        assigned_bdr_name: params.bdrName,
        assigned_bdr_outreach_id: params.bdrOutreachId,
      }),
    },
  );

  if (response.status !== 200 && response.status !== 204) {
    const err = await response.text();
    throw new Error(
      `Track API update failed (${response.status}) for ${params.customerEmail}: ${err}`,
    );
  }
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

  const input = args.get("input");
  if (!input) {
    throw new Error("--input is required (diagnostic JSON report path)");
  }

  const apply = args.get("apply") === "true";
  const concurrency = toInt(args.get("concurrency"), 3, 1, 20);
  const limitRaw = args.get("limit");
  const limit = limitRaw ? toInt(limitRaw, 0, 1, 100000) : undefined;

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const out = resolve(args.get("out") ?? `./reports/cio-assignment-repair-${ts}.json`);

  return {
    input: resolve(input),
    apply,
    concurrency,
    limit,
    out,
  };
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

async function ensureParentDir(filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
}

function isActionable(record: DiagnosticRecord): boolean {
  return (
    record.actionable === true &&
    (record.status === "missing_cio_assignment" || record.status === "mismatch")
  );
}

async function run(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (!CUSTOMER_IO_SITE_ID || !CUSTOMER_IO_API_KEY) {
    throw new Error(
      "Missing Customer.io credentials (CUSTOMER_IO_SITE_ID, CUSTOMER_IO_API_KEY)",
    );
  }
  if (!existsSync(options.input)) {
    throw new Error(`Input file not found: ${options.input}`);
  }

  const raw = await readFile(options.input, "utf8");
  const parsed = JSON.parse(raw) as { records?: DiagnosticRecord[] };
  const records = Array.isArray(parsed.records) ? parsed.records : [];

  const candidates = records
    .filter(isActionable)
    .filter((record) => !!record.outreachOwner?.email)
    .slice(0, options.limit ?? records.length);

  const results = await mapWithConcurrency(candidates, options.concurrency, async (record) => {
    const owner = record.outreachOwner;
    const before = {
      assigned_bdr_email: record.cioAssignment?.assignedBdrEmail ?? null,
      assigned_bdr_name: record.cioAssignment?.assignedBdrName ?? null,
      assigned_bdr_outreach_id: record.cioAssignment?.assignedBdrOutreachId ?? null,
    };

    if (!owner?.email) {
      return {
        email: record.email,
        status: "skipped",
        reason: "Owner email missing; cannot update CIO assignment safely",
        outreachOwner: owner,
        cioBefore: before,
        cioAfter: before,
      } satisfies RepairResult;
    }

    const target = {
      assigned_bdr_email: normalizeEmail(owner.email),
      assigned_bdr_name: owner.name,
      assigned_bdr_outreach_id: owner.id,
    };

    const noDiff =
      before.assigned_bdr_email === target.assigned_bdr_email &&
      before.assigned_bdr_outreach_id === target.assigned_bdr_outreach_id &&
      before.assigned_bdr_name === target.assigned_bdr_name;

    if (noDiff) {
      return {
        email: record.email,
        status: "unchanged",
        reason: "No diff",
        outreachOwner: owner,
        cioBefore: before,
        cioAfter: before,
      } satisfies RepairResult;
    }

    if (!options.apply) {
      return {
        email: record.email,
        status: "updated",
        reason: "Dry-run: would update",
        outreachOwner: owner,
        cioBefore: before,
        cioAfter: target,
      } satisfies RepairResult;
    }

    try {
      await updateCioBdrAssignment({
        customerEmail: record.email,
        bdrEmail: target.assigned_bdr_email,
        bdrName: target.assigned_bdr_name,
        bdrOutreachId: target.assigned_bdr_outreach_id,
      });

      return {
        email: record.email,
        status: "updated",
        reason: "CIO assignment updated",
        outreachOwner: owner,
        cioBefore: before,
        cioAfter: target,
      } satisfies RepairResult;
    } catch (error) {
      return {
        email: record.email,
        status: "error",
        reason: "Failed to update CIO assignment",
        outreachOwner: owner,
        cioBefore: before,
        cioAfter: before,
        error: error instanceof Error ? error.message : String(error),
      } satisfies RepairResult;
    }
  });

  const totals = {
    candidates: candidates.length,
    processed: results.length,
    updated: results.filter((r) => r.status === "updated").length,
    unchanged: results.filter((r) => r.status === "unchanged").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    error: results.filter((r) => r.status === "error").length,
  };

  const report: RepairReport = {
    generatedAt: new Date().toISOString(),
    mode: options.apply ? "apply" : "dry-run",
    input: options.input,
    options: {
      concurrency: options.concurrency,
      limit: options.limit,
    },
    totals,
    results,
  };

  await ensureParentDir(options.out);
  await writeFile(options.out, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("CIO assignment repair complete");
  console.log(`  mode: ${report.mode}`);
  console.log(`  candidates: ${totals.candidates}`);
  console.log(`  updated: ${totals.updated}`);
  console.log(`  errors: ${totals.error}`);
  console.log(`  out: ${options.out}`);
}

run().catch((error) => {
  console.error("repair-cio-assignment failed:", error);
  process.exitCode = 1;
});
