import "server-only";

import {
  fetchRecentSyncCandidates,
  fetchUnassignedBdrCandidates,
  type SyncCandidate,
} from "@/server/clients/bigquery.client";
import { processLead, type SyncResult } from "@/server/services/sync.service";

export type GrowthWorkflowName =
  | "daily_comprehensive_sync"
  | "outreach_auto_healing"
  | "bdr_alignment_backfill"
  | "backfill_checkout";

interface WorkflowOptions {
  limit?: number;
  hoursBack?: number;
  concurrency?: number;
  dryRun?: boolean;
  sinceDate?: string;
}

interface RunCandidateResult {
  email: string;
  eventType: string;
  status: SyncResult["status"];
  outreachAction?: SyncResult["outreachAction"];
  processingTimeMs?: number;
  error?: string;
}

export interface WorkflowRunResult {
  workflow: GrowthWorkflowName;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  candidateCount: number;
  processedCount: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  dryRun: boolean;
  sampleFailures: Array<{ email: string; error: string }>;
}

interface CandidateTask {
  email: string;
  eventType: string;
  propertyName: string | null;
}

function toCandidateTasks(candidates: SyncCandidate[]): CandidateTask[] {
  const deduped = new Map<string, CandidateTask>();

  for (const candidate of candidates) {
    deduped.set(candidate.email.toLowerCase(), {
      email: candidate.email,
      eventType: candidate.lastEventType,
      propertyName: candidate.lastPropertyName,
    });
  }

  return [...deduped.values()];
}

const PROGRESS_LOG_INTERVAL = 50;

async function runCandidates(params: {
  workflow: GrowthWorkflowName;
  candidates: CandidateTask[];
  concurrency: number;
  dryRun: boolean;
}): Promise<WorkflowRunResult> {
  const startedAt = new Date();
  const startedMs = Date.now();
  const total = params.candidates.length;

  console.log(
    `🚀 [${params.workflow}] Starting | candidates: ${total} | concurrency: ${params.concurrency} | dryRun: ${params.dryRun}`,
  );

  let index = 0;
  let completedCount = 0;
  const results: RunCandidateResult[] = [];

  const workerCount = Math.max(1, Math.min(params.concurrency, 25));

  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const current = index;
      index += 1;

      if (current >= params.candidates.length) {
        return;
      }

      const candidate = params.candidates[current]!;

      if (params.dryRun) {
        results.push({
          email: candidate.email,
          eventType: candidate.eventType,
          status: "skipped",
        });
        completedCount += 1;
        continue;
      }

      const syncResult = await processLead({
        email: candidate.email,
        eventType: candidate.eventType,
        eventData: {
          property_name: candidate.propertyName ?? undefined,
          source_workflow: params.workflow,
        },
      });

      results.push({
        email: candidate.email,
        eventType: candidate.eventType,
        status: syncResult.status,
        outreachAction: syncResult.outreachAction,
        processingTimeMs: syncResult.processingTimeMs,
        error: syncResult.error,
      });

      completedCount += 1;
      if (completedCount % PROGRESS_LOG_INTERVAL === 0) {
        const pct = Math.round((completedCount / total) * 100);
        const successSoFar = results.filter((r) => r.status === "success").length;
        const failedSoFar = results.filter((r) => r.status === "failed").length;
        const elapsedS = ((Date.now() - startedMs) / 1000).toFixed(1);
        console.log(
          `⏳ [${params.workflow}] Progress: ${completedCount}/${total} (${pct}%) | ✅ ${successSoFar} | ❌ ${failedSoFar} | ${elapsedS}s elapsed`,
        );
      }
    }
  });

  await Promise.all(workers);

  const successCount = results.filter((r) => r.status === "success").length;
  const failedCount = results.filter((r) => r.status === "failed").length;
  const skippedCount = results.filter((r) => r.status === "skipped").length;

  const totalMs = Date.now() - startedMs;
  console.log(
    `✅ [${params.workflow}] Done | ${successCount} success | ${failedCount} failed | ${skippedCount} skipped | ${(totalMs / 1000).toFixed(1)}s`,
  );

  return {
    workflow: params.workflow,
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - startedMs,
    candidateCount: params.candidates.length,
    processedCount: results.length,
    successCount,
    failedCount,
    skippedCount,
    dryRun: params.dryRun,
    sampleFailures: results
      .filter((result) => result.status === "failed" && !!result.error)
      .slice(0, 20)
      .map((result) => ({
        email: result.email,
        error: result.error ?? "unknown",
      })),
  };
}

async function runDailyComprehensiveSync(
  options: WorkflowOptions,
): Promise<WorkflowRunResult> {
  const limit = options.limit ?? 1000;
  const hoursBack = options.hoursBack ?? 24;
  const concurrency = options.concurrency ?? 8;

  const candidates = await fetchRecentSyncCandidates({
    hoursBack,
    limit,
    onlyCheckout: true,
  });

  return runCandidates({
    workflow: "daily_comprehensive_sync",
    candidates: toCandidateTasks(candidates),
    concurrency,
    dryRun: options.dryRun ?? false,
  });
}

async function runOutreachAutoHealing(
  options: WorkflowOptions,
): Promise<WorkflowRunResult> {
  const limit = options.limit ?? 1200;
  const hoursBack = options.hoursBack ?? 48;
  const concurrency = options.concurrency ?? 8;

  const candidates = await fetchRecentSyncCandidates({
    hoursBack,
    limit,
    onlyCheckout: false,
  });

  return runCandidates({
    workflow: "outreach_auto_healing",
    candidates: toCandidateTasks(candidates),
    concurrency,
    dryRun: options.dryRun ?? false,
  });
}

async function runBdrAlignmentBackfill(
  options: WorkflowOptions,
): Promise<WorkflowRunResult> {
  const limit = options.limit ?? 1200;
  const hoursBack = options.hoursBack ?? 24;
  const concurrency = options.concurrency ?? 8;

  const candidates = await fetchUnassignedBdrCandidates({
    hoursBack,
    limit,
  });

  return runCandidates({
    workflow: "bdr_alignment_backfill",
    candidates: toCandidateTasks(candidates),
    concurrency,
    dryRun: options.dryRun ?? false,
  });
}

async function runBackfillCheckout(
  options: WorkflowOptions,
): Promise<WorkflowRunResult> {
  const limit = options.limit ?? 2000;
  const concurrency = options.concurrency ?? 5;

  const dateLabel = options.sinceDate ?? `last ${options.hoursBack ?? 336}h`;
  console.log(`🔍 [backfill_checkout] Fetching candidates since ${dateLabel} (limit: ${limit})...`);

  const candidates = await fetchRecentSyncCandidates({
    hoursBack: options.hoursBack ?? 336, // fallback: 14 days
    limit,
    onlyCheckout: false,
    sinceDate: options.sinceDate,
  });

  console.log(`📋 [backfill_checkout] Found ${candidates.length} candidates`);

  return runCandidates({
    workflow: "backfill_checkout",
    candidates: toCandidateTasks(candidates),
    concurrency,
    dryRun: options.dryRun ?? false,
  });
}

export async function runGrowthWorkflow(
  workflow: GrowthWorkflowName,
  options: WorkflowOptions = {},
): Promise<WorkflowRunResult> {
  switch (workflow) {
    case "daily_comprehensive_sync":
      return runDailyComprehensiveSync(options);
    case "outreach_auto_healing":
      return runOutreachAutoHealing(options);
    case "bdr_alignment_backfill":
      return runBdrAlignmentBackfill(options);
    case "backfill_checkout":
      return runBackfillCheckout(options);
    default: {
      const _never: never = workflow;
      throw new Error(`Unknown workflow: ${String(_never)}`);
    }
  }
}
