#!/usr/bin/env bun
/**
 * Health check for the CIO → Outreach sync pipeline.
 *
 * Connectivity tier: DB, BigQuery, Customer.io, Outreach.
 * Pipeline tier: pull recent `user_signed_up` (and optionally other)
 * events from BQ, look each email up in Outreach, report sync hit-rate.
 *
 * Usage:
 *   bun run src/scripts/health-check.ts
 *   bun run src/scripts/health-check.ts --hours 24 --sample 30
 *   bun run src/scripts/health-check.ts --events user_signed_up,checkout_started
 *   bun run src/scripts/health-check.ts --json
 */

process.env.SKIP_ENV_VALIDATION ??= "1";

import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { executeQuery } from "@/server/clients/bigquery.client";
import { getCustomerByEmail } from "@/server/clients/customerio.client";
import {
  isOutreachConfigured,
  searchProspectByEmail,
  testConnection as outreachTestConnection,
} from "@/server/clients/outreach.client";

type Status = "ok" | "fail" | "skip" | "warn";
type Check = { name: string; status: Status; ms: number; detail?: string };

type CliOptions = {
  hours: number;
  sample: number;
  events: string[];
  concurrency: number;
  json: boolean;
  diagnose: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  const args = new Map<string, string>();
  let json = false;
  let diagnose = false;
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (token === "--json") {
      json = true;
      continue;
    }
    if (token === "--diagnose") {
      diagnose = true;
      continue;
    }
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        args.set(key, next);
        i++;
      }
    }
  }
  const toInt = (
    v: string | undefined,
    fallback: number,
    min: number,
    max: number,
  ) => {
    const n = Number.parseInt(v ?? "", 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  };
  return {
    hours: toInt(args.get("hours"), 24, 1, 168),
    sample: toInt(args.get("sample"), 25, 1, 200),
    events: (args.get("events") ?? "user_signed_up")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    concurrency: toInt(args.get("concurrency"), 5, 1, 20),
    json,
    diagnose,
  };
}

const opts = parseArgs(process.argv.slice(2));

async function timed<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<{ value: T | null; check: Check }> {
  const start = Date.now();
  try {
    const value = await fn();
    return { value, check: { name, status: "ok", ms: Date.now() - start } };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      value: null,
      check: { name, status: "fail", ms: Date.now() - start, detail },
    };
  }
}

// ===== Connectivity tier =====

async function checkDb(): Promise<Check> {
  const { check } = await timed("Neon DB", async () => {
    const rows = await db.execute(sql`SELECT 1 as ok`);
    if (!rows) throw new Error("no result");
    return rows;
  });
  return check;
}

async function checkBigQuery(): Promise<Check> {
  const { check } = await timed("BigQuery", async () => {
    const rows = await executeQuery<{ ok: number }>("SELECT 1 as ok");
    if (rows[0]?.ok !== 1) throw new Error("unexpected response");
    return rows;
  });
  return check;
}

async function checkCustomerIO(): Promise<Check> {
  const { check } = await timed("Customer.io", async () => {
    // Lookup of a known internal address. Returns null gracefully if absent —
    // the meaningful signal is that the App API call returned a 2xx.
    await getCustomerByEmail("kristian@wander.com");
    return true;
  });
  return check;
}

async function checkOutreach(): Promise<Check> {
  if (!isOutreachConfigured) {
    return {
      name: "Outreach",
      status: "skip",
      ms: 0,
      detail: "neither S2S nor OAuth env is configured",
    };
  }
  const start = Date.now();
  try {
    const result = await outreachTestConnection();
    return {
      name: "Outreach",
      status: result.success ? "ok" : "fail",
      ms: Date.now() - start,
      detail: result.success ? undefined : result.message,
    };
  } catch (err) {
    return {
      name: "Outreach",
      status: "fail",
      ms: Date.now() - start,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

// ===== Pipeline tier =====

type RecentEvent = { email: string; event_type: string; ts: string };

async function fetchRecentSignups(): Promise<RecentEvent[]> {
  // Distinct emails per (email, event_type) pair, most recent first.
  // Joins funnel_events to customer_profiles for email resolution —
  // matches the pattern in fetchRecentSyncCandidates.
  const eventList = opts.events
    .map((e) => `'${e.replace(/'/g, "''")}'`)
    .join(", ");
  const query = `
WITH recent AS (
  SELECT
    LOWER(cp.email) AS email,
    fe.event_type,
    fe.ts,
    ROW_NUMBER() OVER (
      PARTITION BY LOWER(cp.email), fe.event_type
      ORDER BY fe.ts DESC
    ) AS rn
  FROM \`wander-9fc9c.analytics.funnel_events\` fe
  JOIN \`wander-9fc9c.analytics.customer_profiles\` cp
    ON cp.id_user = fe.id_user
  WHERE cp.email IS NOT NULL
    AND fe.ts >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @hours HOUR)
    AND fe.event_type IN (${eventList})
)
SELECT email, event_type, FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', ts) AS ts
FROM recent
WHERE rn = 1
ORDER BY ts DESC
LIMIT @sample
`;
  return executeQuery<RecentEvent>(
    query,
    { hours: opts.hours, sample: opts.sample },
    { hours: "INT64", sample: "INT64" },
  );
}

type LookupResult = {
  email: string;
  event_type: string;
  ts: string;
  found: boolean;
  prospectId?: string;
  error?: string;
};

async function lookupOutreachBatch(
  events: RecentEvent[],
): Promise<LookupResult[]> {
  const out = new Array<LookupResult>(events.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(opts.concurrency, events.length) },
    async () => {
      while (true) {
        const i = cursor++;
        if (i >= events.length) return;
        const e = events[i]!;
        try {
          const prospect = await searchProspectByEmail(e.email);
          out[i] = {
            email: e.email,
            event_type: e.event_type,
            ts: e.ts,
            found: !!prospect,
            prospectId: prospect ? String(prospect.id) : undefined,
          };
        } catch (err) {
          out[i] = {
            email: e.email,
            event_type: e.event_type,
            ts: e.ts,
            found: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }
    },
  );
  await Promise.all(workers);
  return out;
}

// ===== Diagnose-missing tier =====

type CioProbe = {
  email: string;
  inCio: boolean;
  cioId?: string;
  assignedBdrEmail?: string | null;
  assignedBdrOutreachId?: string | null;
  attributeCount?: number;
  error?: string;
};

async function probeCio(emails: string[]): Promise<CioProbe[]> {
  const out = new Array<CioProbe>(emails.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(opts.concurrency, emails.length) },
    async () => {
      while (true) {
        const i = cursor++;
        if (i >= emails.length) return;
        const email = emails[i]!;
        try {
          const c = await getCustomerByEmail(email);
          out[i] = c
            ? {
                email,
                inCio: true,
                cioId: c.id,
                assignedBdrEmail: c.assignedBdrEmail ?? null,
                assignedBdrOutreachId: c.assignedBdrOutreachId ?? null,
                attributeCount: Object.keys(c.attributes).length,
              }
            : { email, inCio: false };
        } catch (err) {
          out[i] = {
            email,
            inCio: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }
    },
  );
  await Promise.all(workers);
  return out;
}

function printDiagnose(probes: CioProbe[]) {
  if (probes.length === 0) return;
  console.log(
    "\nDiagnose missing — Customer.io state for emails missing in Outreach",
  );
  console.log("─".repeat(80));
  const inCio = probes.filter((p) => p.inCio).length;
  const orphaned = probes.filter(
    (p) => p.inCio && !p.assignedBdrOutreachId,
  ).length;
  const errored = probes.filter((p) => !!p.error).length;
  console.log(`  In Customer.io:               ${inCio}/${probes.length}`);
  console.log(`  In CIO but no BDR-Outreach link: ${orphaned}`);
  console.log(`  CIO probe errors:             ${errored}`);
  console.log("");
  for (const p of probes.slice(0, 20)) {
    if (p.error) {
      console.log(`  ! ${p.email}  CIO error: ${p.error}`);
    } else if (!p.inCio) {
      console.log(`  ✗ ${p.email}  not in CIO either`);
    } else {
      const bdr = p.assignedBdrEmail ?? "—";
      const orId = p.assignedBdrOutreachId ?? "—";
      console.log(
        `  ✓ ${p.email}  CIO[${p.cioId}] attrs=${p.attributeCount}  bdr=${bdr}  outreachId=${orId}`,
      );
    }
  }
}

// ===== Output =====

const STATUS_GLYPH: Record<Status, string> = {
  ok: "✓",
  fail: "✗",
  skip: "·",
  warn: "!",
};

function printChecks(checks: Check[]) {
  const nameWidth = Math.max(...checks.map((c) => c.name.length), 12);
  console.log("\nConnectivity");
  console.log("─".repeat(nameWidth + 28));
  for (const c of checks) {
    const glyph = STATUS_GLYPH[c.status];
    const line = `${glyph} ${c.name.padEnd(nameWidth)}  ${c.status.toUpperCase().padEnd(5)} ${String(c.ms).padStart(5)}ms`;
    console.log(c.detail ? `${line}  — ${c.detail}` : line);
  }
}

function printPipeline(events: RecentEvent[], lookups: LookupResult[]) {
  const total = lookups.length;
  const found = lookups.filter((l) => l.found).length;
  const missing = lookups.filter((l) => !l.found && !l.error).length;
  const errored = lookups.filter((l) => !!l.error).length;
  const rate = total === 0 ? 0 : Math.round((found / total) * 1000) / 10;

  console.log("\nPipeline (CIO → Outreach)");
  console.log("─".repeat(60));
  console.log(`  Window:        last ${opts.hours}h`);
  console.log(`  Events:        ${opts.events.join(", ")}`);
  console.log(
    `  BQ candidates: ${events.length} unique (sample cap ${opts.sample})`,
  );
  console.log(`  In Outreach:   ${found}/${total}  (${rate}%)`);
  console.log(`  Missing:       ${missing}`);
  console.log(`  Errored:       ${errored}`);

  const missingSample = lookups
    .filter((l) => !l.found && !l.error)
    .slice(0, 10);
  if (missingSample.length) {
    console.log("\n  Sample of emails not found in Outreach:");
    for (const m of missingSample) {
      console.log(`    - ${m.email}  [${m.event_type}, ${m.ts}]`);
    }
  }

  const erroredSample = lookups.filter((l) => !!l.error).slice(0, 5);
  if (erroredSample.length) {
    console.log("\n  Sample of lookup errors:");
    for (const e of erroredSample) {
      console.log(`    - ${e.email}: ${e.error}`);
    }
  }

  return { total, found, missing, errored, rate };
}

// ===== Run =====

async function main() {
  if (!opts.json) {
    console.log("Health check — Wander growth pipeline");
    console.log(
      `  hours=${opts.hours}  sample=${opts.sample}  events=${opts.events.join(",")}  concurrency=${opts.concurrency}`,
    );
  }

  const connectivity = await Promise.all([
    checkDb(),
    checkBigQuery(),
    checkCustomerIO(),
    checkOutreach(),
  ]);

  const bqOk = connectivity.find((c) => c.name === "BigQuery")?.status === "ok";
  const outreachOk =
    connectivity.find((c) => c.name === "Outreach")?.status === "ok";

  let events: RecentEvent[] = [];
  let lookups: LookupResult[] = [];
  let pipelineSummary: ReturnType<typeof printPipeline> | null = null;

  if (bqOk && outreachOk) {
    try {
      events = await fetchRecentSignups();
    } catch (err) {
      connectivity.push({
        name: "BQ recent-signups query",
        status: "fail",
        ms: 0,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
    if (events.length > 0) {
      lookups = await lookupOutreachBatch(events);
    }
  }

  let probes: CioProbe[] = [];
  if (opts.diagnose && lookups.length > 0) {
    const missingEmails = lookups
      .filter((l) => !l.found && !l.error)
      .map((l) => l.email);
    if (missingEmails.length > 0) {
      probes = await probeCio(missingEmails);
    }
  }

  if (opts.json) {
    const out = {
      connectivity,
      pipeline: {
        window_hours: opts.hours,
        events: opts.events,
        candidates: events.length,
        sample_cap: opts.sample,
        looked_up: lookups.length,
        found: lookups.filter((l) => l.found).length,
        missing: lookups.filter((l) => !l.found && !l.error).length,
        errored: lookups.filter((l) => !!l.error).length,
        results: lookups,
      },
      diagnose: opts.diagnose ? { probes } : null,
    };
    console.log(JSON.stringify(out, null, 2));
  } else {
    printChecks(connectivity);
    if (bqOk && outreachOk) {
      pipelineSummary = printPipeline(events, lookups);
      if (opts.diagnose) printDiagnose(probes);
    } else {
      console.log(
        "\nPipeline check skipped — BigQuery or Outreach connectivity failed.",
      );
    }
    console.log("");
  }

  const anyFail =
    connectivity.some((c) => c.status === "fail") ||
    (pipelineSummary !== null && pipelineSummary.errored > 0);
  process.exit(anyFail ? 1 : 0);
}

main().catch((err) => {
  console.error("Health check crashed:", err);
  process.exit(1);
});
