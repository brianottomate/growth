import "server-only";

import { after } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import {
  pregenNativeBuildTable,
  pregenNativeProspectTable,
  type PregenNativeBuildStep,
  type PregenNativeStepLogEntry,
} from "@/server/db/schema";

import { crawlStep } from "./steps/crawl";
import { planStep } from "./steps/plan";
import { generateSectionsStep } from "./steps/generate-sections";
import { injectPropertiesStep } from "./steps/inject-properties";
import { persistArtifactStep } from "./steps/persist-artifact";

// ---- STEP CONTRACT --------------------------------------------------

export type StepContext = {
  buildId: string;
  prospectId: string;
  sourceUrl: string;
};

type StepFn = (ctx: StepContext) => Promise<Record<string, number> | void>;

/**
 * Ordered pipeline. Each step reads its input from the DB (written by the
 * previous step) rather than an in-memory payload, so a build survives
 * function-instance turnover: the chain re-enters via `runBuildFrom` and
 * picks up at the failed/next step. Temporal's durability, minus Temporal.
 */
const PIPELINE: Array<{ step: PregenNativeBuildStep; run: StepFn }> = [
  { step: "crawl", run: crawlStep },
  { step: "plan", run: planStep },
  { step: "generate_sections", run: generateSectionsStep },
  { step: "inject_properties", run: injectPropertiesStep },
  { step: "persist_artifact", run: persistArtifactStep },
];

// ---- RUNNER ----------------------------------------------------------

/**
 * Kick off (or resume) a build. Runs the next pending step inline, then
 * schedules the following one via `after()` so each step gets a fresh
 * function invocation — the Fluid-compute analogue of a Temporal activity
 * boundary. Progress and errors land on the build row, which doubles as
 * the UI's progress feed.
 */
export async function runBuild(buildId: string): Promise<void> {
  const more = await runNextStep(buildId);
  if (!more) return;

  // Schedule the next step on a fresh invocation.
  after(async () => {
    await runBuild(buildId);
  });
}

/**
 * Run every remaining step in one process, no `after()` involved.
 *
 * `after()` needs a request context, so a build cannot be driven from a CLI or
 * a test through `runBuild`. This is the same steps in the same order, losing
 * only the fresh-invocation boundary — which is a serverless memory and timeout
 * concern, not a correctness one. Checkpointing is unchanged, so a run killed
 * halfway still resumes through the normal path.
 */
export async function runBuildToCompletion(buildId: string): Promise<void> {
  while (await runNextStep(buildId)) {
    // Each iteration advances exactly one step and persists its outcome.
  }
}

/** Advance one step. Returns true when the build has more steps to run. */
async function runNextStep(buildId: string): Promise<boolean> {
  const build = await db.query.pregenNativeBuildTable.findFirst({
    where: eq(pregenNativeBuildTable.id, buildId),
    with: { prospect: true },
  });
  if (!build) throw new Error(`pregen build not found: ${buildId}`);
  if (build.status === "succeeded" || build.status === "failed") return false;

  const completed = new Set(
    build.stepLog.filter((e) => e.finishedAt && !e.error).map((e) => e.step),
  );
  const next = PIPELINE.find((p) => !completed.has(p.step));

  if (!next) {
    await finishBuild(buildId, "succeeded");
    return false;
  }

  const ctx: StepContext = {
    buildId,
    prospectId: build.prospectId,
    sourceUrl: build.prospect.sourceUrl,
  };

  await markStepStarted(build.id, build.stepLog, next.step);

  try {
    const stats = (await next.run(ctx)) ?? undefined;
    await markStepFinished(build.id, next.step, { stats: stats ?? undefined });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markStepFinished(build.id, next.step, { error: message });
    await finishBuild(buildId, "failed", message);
    return false;
  }

  return true;
}

// ---- BOOKKEEPING -----------------------------------------------------

async function markStepStarted(
  buildId: string,
  stepLog: PregenNativeStepLogEntry[],
  step: PregenNativeBuildStep,
): Promise<void> {
  const entry: PregenNativeStepLogEntry = {
    step,
    startedAt: new Date().toISOString(),
  };
  await db
    .update(pregenNativeBuildTable)
    .set({
      status: "running",
      currentStep: step,
      startedAt: stepLog.length === 0 ? new Date() : undefined,
      stepLog: [...stepLog, entry],
    })
    .where(eq(pregenNativeBuildTable.id, buildId));
}

async function markStepFinished(
  buildId: string,
  step: PregenNativeBuildStep,
  outcome: { stats?: Record<string, number>; error?: string },
): Promise<void> {
  const build = await db.query.pregenNativeBuildTable.findFirst({
    where: eq(pregenNativeBuildTable.id, buildId),
    columns: { stepLog: true },
  });
  if (!build) return;

  const stepLog = build.stepLog.map((e) =>
    e.step === step && !e.finishedAt
      ? {
          ...e,
          finishedAt: new Date().toISOString(),
          stats: outcome.stats,
          error: outcome.error,
        }
      : e,
  );
  await db
    .update(pregenNativeBuildTable)
    .set({ stepLog })
    .where(eq(pregenNativeBuildTable.id, buildId));
}

async function finishBuild(
  buildId: string,
  status: "succeeded" | "failed",
  error?: string,
): Promise<void> {
  const build = await db
    .update(pregenNativeBuildTable)
    .set({ status, error, currentStep: null, finishedAt: new Date() })
    .where(eq(pregenNativeBuildTable.id, buildId))
    .returning({ prospectId: pregenNativeBuildTable.prospectId });

  const prospectId = build[0]?.prospectId;
  if (!prospectId) return;

  await db
    .update(pregenNativeProspectTable)
    .set({ status: status === "succeeded" ? "preview_ready" : "failed" })
    .where(eq(pregenNativeProspectTable.id, prospectId));
}
