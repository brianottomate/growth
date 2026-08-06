#!/usr/bin/env bun
/**
 * One-shot backfill: pull events from BigQuery for the last N hours and
 * sync each unique email to Outreach via processLead. Designed to recover
 * accounts that were lost during the CIO webhook timeout incident
 * (2026-04 → 2026-05-08).
 *
 * Defaults: last 14 days (336h), user_signed_up only, concurrency 4.
 *
 * Idempotent — processLead does search-then-update-or-create on Outreach.
 * Safe to re-run. Per-email failures don't abort the whole run.
 *
 * Usage:
 *   bun run src/scripts/backfill-event-syncs.ts
 *   bun run src/scripts/backfill-event-syncs.ts --hours 336 --events user_signed_up --concurrency 4
 *   bun run src/scripts/backfill-event-syncs.ts --events user_signed_up,checkout_started,payment_info_entered
 *   bun run src/scripts/backfill-event-syncs.ts --dry-run    # just print candidates, don't sync
 */

process.env.SKIP_ENV_VALIDATION ??= "1";

import { executeQuery } from "@/server/clients/bigquery.client";
import { processLead } from "@/server/services/sync.service";

type Candidate = {
  email: string;
  event_type: string;
  property_name: string | null;
  ts: string;
};

type CliOptions = {
  hours: number;
  events: string[];
  concurrency: number;
  limit: number;
  dryRun: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  const args = new Map<string, string>();
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (token === "--dry-run") {
      dryRun = true;
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
    hours: toInt(args.get("hours"), 336, 1, 24 * 60), // default 14 days
    events: (args.get("events") ?? "user_signed_up")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    concurrency: toInt(args.get("concurrency"), 4, 1, 16),
    limit: toInt(args.get("limit"), 5000, 1, 50000),
    dryRun,
  };
}

const opts = parseArgs(process.argv.slice(2));

async function fetchCandidates(): Promise<Candidate[]> {
  const eventList = opts.events
    .map((e) => `'${e.replace(/'/g, "''")}'`)
    .join(", ");
  // One row per email — most recent matching event wins. We pass the
  // freshest event_type into processLead so its existing logic for
  // BDR-source / stage selection (DEMAND_NEW for signups, DEMAND_BOOKED
  // for orders, etc.) still applies correctly.
  const query = `
WITH ranked AS (
  SELECT
    LOWER(cp.email) AS email,
    fe.event_type,
    REGEXP_REPLACE(fe.property_name, r'^Wander ', '') AS property_name,
    fe.ts,
    ROW_NUMBER() OVER (
      PARTITION BY LOWER(cp.email)
      ORDER BY fe.ts DESC
    ) AS rn
  FROM \`wander-9fc9c.analytics.funnel_events\` fe
  JOIN \`wander-9fc9c.analytics.customer_profiles\` cp
    ON cp.id_user = fe.id_user
  WHERE cp.email IS NOT NULL
    AND fe.ts >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @hours_back HOUR)
    AND fe.event_type IN (${eventList})
)
SELECT
  email,
  event_type,
  property_name,
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', ts) AS ts
FROM ranked
WHERE rn = 1
ORDER BY ts DESC
LIMIT @limit
`;
  return executeQuery<Candidate>(
    query,
    { hours_back: opts.hours, limit: opts.limit },
    { hours_back: "INT64", limit: "INT64" },
  );
}

type WorkerResult =
  | {
      status: "ok";
      action: "created" | "updated" | "skipped" | "no_action";
      ms: number;
    }
  | { status: "error"; message: string; ms: number };

async function runOne(c: Candidate): Promise<WorkerResult> {
  const start = Date.now();
  try {
    const result = await processLead({
      email: c.email,
      eventType: c.event_type,
      eventData: c.property_name ? { property_name: c.property_name } : {},
    });
    const action = (result.outreachAction ?? "no_action") as
      | "created"
      | "updated"
      | "skipped"
      | "no_action";
    return { status: "ok", action, ms: Date.now() - start };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : String(err),
      ms: Date.now() - start,
    };
  }
}

async function runWithConcurrency(
  candidates: Candidate[],
): Promise<{ results: WorkerResult[]; emails: string[] }> {
  const results = new Array<WorkerResult>(candidates.length);
  const emails: string[] = candidates.map((c) => c.email);
  let cursor = 0;
  let completed = 0;
  const total = candidates.length;
  const startedAt = Date.now();

  const tick = (i: number, r: WorkerResult) => {
    completed++;
    const c = candidates[i]!;
    const tag = r.status === "ok" ? r.action.padEnd(7) : "ERROR  ";
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
    const pct = ((completed / total) * 100).toFixed(1);
    const detail = r.status === "error" ? `  — ${r.message}` : "";
    console.log(
      `[${completed}/${total} ${pct}% ${elapsed}s] ${tag} ${c.email} (${c.event_type}, ${r.ms}ms)${detail}`,
    );
  };

  const workers = Array.from(
    { length: Math.min(opts.concurrency, candidates.length) },
    async () => {
      while (true) {
        const i = cursor++;
        if (i >= candidates.length) return;
        const r = await runOne(candidates[i]!);
        results[i] = r;
        tick(i, r);
      }
    },
  );
  await Promise.all(workers);
  return { results, emails };
}

function summarize(candidates: Candidate[], results: WorkerResult[]) {
  const counts = {
    created: 0,
    updated: 0,
    skipped: 0,
    no_action: 0,
    error: 0,
  };
  const errors: Array<{ email: string; message: string }> = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    if (r.status === "ok") {
      counts[r.action]++;
    } else {
      counts.error++;
      errors.push({ email: candidates[i]!.email, message: r.message });
    }
  }
  console.log("\n=== Summary ===");
  console.log(`  Total candidates:  ${candidates.length}`);
  console.log(`  Created:           ${counts.created}`);
  console.log(`  Updated:           ${counts.updated}`);
  console.log(`  Skipped:           ${counts.skipped}`);
  console.log(`  No action:         ${counts.no_action}`);
  console.log(`  Errored:           ${counts.error}`);

  if (errors.length > 0) {
    console.log("\n=== Errors (first 20) ===");
    for (const e of errors.slice(0, 20)) {
      console.log(`  ${e.email}: ${e.message}`);
    }
    if (errors.length > 20) {
      console.log(`  ... and ${errors.length - 20} more`);
    }
  }
}

async function main() {
  console.log("Backfill — event-driven Outreach sync");
  console.log(
    `  hours=${opts.hours} (${(opts.hours / 24).toFixed(1)}d)  events=${opts.events.join(",")}  concurrency=${opts.concurrency}  limit=${opts.limit}  dryRun=${opts.dryRun}`,
  );

  console.log("\nFetching candidates from BigQuery...");
  const fetchStart = Date.now();
  const candidates = await fetchCandidates();
  console.log(
    `Found ${candidates.length} unique emails in ${Date.now() - fetchStart}ms`,
  );

  if (candidates.length === 0) {
    console.log("Nothing to do.");
    process.exit(0);
  }

  // By-event breakdown so the user sees the mix before sync starts.
  const byEvent = new Map<string, number>();
  for (const c of candidates)
    byEvent.set(c.event_type, (byEvent.get(c.event_type) ?? 0) + 1);
  console.log("\nBreakdown by latest event type:");
  for (const [ev, n] of [...byEvent.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${ev.padEnd(28)} ${n}`);
  }

  if (opts.dryRun) {
    console.log("\n--dry-run: skipping processLead calls. Sample of first 10:");
    for (const c of candidates.slice(0, 10)) {
      console.log(`  ${c.email}  [${c.event_type} @ ${c.ts}]`);
    }
    process.exit(0);
  }

  console.log("\nSyncing...\n");
  const { results } = await runWithConcurrency(candidates);
  summarize(candidates, results);

  const anyErrors = results.some((r) => r.status === "error");
  process.exit(anyErrors ? 1 : 0);
}

main().catch((err) => {
  console.error("Backfill crashed:", err);
  process.exit(1);
});
