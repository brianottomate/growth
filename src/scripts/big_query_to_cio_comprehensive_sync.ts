#!/usr/bin/env bun

process.env.SKIP_ENV_VALIDATION ??= "1";

import {
  runGrowthWorkflow,
  type GrowthWorkflowName,
} from "../server/services/growth-workflows.service";

type CliOptions = {
  job: GrowthWorkflowName;
  hoursBack?: number;
  limit: number;
  concurrency: number;
  dryRun: boolean;
  sinceDate?: string;
};

const WORKFLOW_NAMES: GrowthWorkflowName[] = [
  "daily_comprehensive_sync",
  "outreach_auto_healing",
  "bdr_alignment_backfill",
  "backfill_checkout",
];

function isWorkflowName(value: string): value is GrowthWorkflowName {
  return WORKFLOW_NAMES.includes(value as GrowthWorkflowName);
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

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  return ["1", "true", "yes", "y"].includes(value.toLowerCase());
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

  const rawJob = args.get("job") ?? "daily_comprehensive_sync";
  if (!isWorkflowName(rawJob)) {
    throw new Error(
      `Invalid --job '${rawJob}'. Allowed: ${WORKFLOW_NAMES.join(", ")}`,
    );
  }

  // Local script default for daily sync is 7 days (cron endpoint remains 24h).
  const defaultHoursBack = rawJob === "daily_comprehensive_sync" ? 168 : 24;
  const hoursBack = toInt(args.get("hours-back"), defaultHoursBack, 1, 24 * 90);
  const limit = toInt(args.get("limit"), 1000, 1, 10000);
  const concurrency = toInt(args.get("concurrency"), 8, 1, 25);
  const dryRun = parseBool(args.get("dry-run"), true);
  const sinceDate = args.get("since");

  return {
    job: rawJob,
    hoursBack,
    limit,
    concurrency,
    dryRun,
    sinceDate,
  };
}

function printUsage(): void {
  console.log(`
Usage:
  bun run src/scripts/big_query_to_cio_comprehensive_sync.ts [options]

Options:
  --job <name>            Workflow name (default: daily_comprehensive_sync)
  --hours-back <n>        Time window in hours (default: 168 for daily, else 24)
  --limit <n>             Max candidates (default: 1000)
  --concurrency <n>       Worker concurrency 1-25 (default: 8)
  --dry-run <bool>        Skip writes (default: true)
  --since <iso-date>      Optional lower bound timestamp for backfill_checkout

Examples:
  bun run src/scripts/big_query_to_cio_comprehensive_sync.ts
  bun run src/scripts/big_query_to_cio_comprehensive_sync.ts --dry-run false
  bun run src/scripts/big_query_to_cio_comprehensive_sync.ts --job outreach_auto_healing --hours-back 48 --dry-run true
`);
}

async function run(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    printUsage();
    return;
  }

  const options = parseArgs(argv);
  console.log(
    `🚀 Running ${options.job} | hoursBack=${options.hoursBack} | limit=${options.limit} | concurrency=${options.concurrency} | dryRun=${options.dryRun}${options.sinceDate ? ` | since=${options.sinceDate}` : ""}`,
  );

  const result = await runGrowthWorkflow(options.job, {
    dryRun: options.dryRun,
    limit: options.limit,
    hoursBack: options.hoursBack,
    concurrency: options.concurrency,
    sinceDate: options.sinceDate,
  });

  console.log("\n✅ Workflow result:\n");
  console.log(JSON.stringify(result, null, 2));
}

run().catch((error) => {
  console.error("❌ big_query_to_cio_comprehensive_sync failed:", error);
  process.exit(1);
});
