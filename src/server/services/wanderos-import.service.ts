import {
  startWorkflowRun,
  claimWorkflowRun,
  updateWorkflowRun,
  failWorkflowRun,
  expireWorkflowRuns,
} from "./workflow-run.service";
import { prepareInitialCatalog } from "./catalog-quick-fix.service";
import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  brandTable,
  workflowRunTable,
  homeGroupTable,
} from "@/server/db/schema";
import {
  initialImportSteps,
  runWanderOsImportSteps,
  wanderOsImportStepSchema,
} from "@/lib/wanderos-import";
import { featuredHomeAdditions } from "@/lib/featured-home-selection";
import { catalogBrand, catalogState } from "./catalog-studio.service";
import {
  ingestBrandHomes,
  listAllBrandHomes,
  setHomeFeatured,
} from "./homes.service";
import { suggestFeaturedHomes } from "./featured-home-suggestions.service";
import { draftBrandMarkets } from "./brand-markets.service";

import { missingCreativeFoundations } from "@/lib/brand-creative-readiness";

function requireCreativeFoundations(
  brand: Parameters<typeof missingCreativeFoundations>[0],
) {
  const missing = missingCreativeFoundations(brand);
  if (missing.length)
    throw new Error(
      `Complete brand setup before importing WanderOS: ${missing.join(", ")}.`,
    );
}

const PROVIDER = "wanderos-import";
const whereRun = (brandId: string) =>
  and(
    eq(workflowRunTable.brandId, brandId),
    eq(workflowRunTable.workflowType, PROVIDER),
  );
function view(run: typeof workflowRunTable.$inferSelect) {
  const parsed = wanderOsImportStepSchema
    .array()
    .safeParse(run.progress?.steps);
  return {
    id: run.id,
    status: run.status === "cancelled" ? ("failed" as const) : run.status,
    steps: initialImportSteps().map((step) =>
      parsed.success
        ? (parsed.data.find((saved) => saved.step === step.step) ?? step)
        : step,
    ),
    error: run.error,
  };
}
export async function wanderOsImportStatus(input: {
  userId: string;
  brandId: string;
}) {
  const brand = await catalogBrand(input.userId, input.brandId);
  await expireWorkflowRuns(input.brandId);
  const run = await db.query.workflowRunTable.findFirst({
    where: whereRun(input.brandId),
    orderBy: [desc(workflowRunTable.createdAt)],
  });
  return {
    run: run ? view(run) : null,
    missingFoundations: missingCreativeFoundations(brand),
    setupHref: `/app/performance/clients/${brand.slug ?? brand.id}/setup`,
  };
}
export async function startWanderOsImport(input: {
  userId: string;
  brandId: string;
}) {
  const brand = await catalogBrand(input.userId, input.brandId);
  requireCreativeFoundations(brand);
  const { run: latest } = await wanderOsImportStatus(input);
  const steps =
    latest?.status === "failed"
      ? latest.steps.map((step) =>
          step.status === "ready"
            ? step
            : { ...step, status: "pending" as const, message: "" },
        )
      : initialImportSteps();
  const { run, started } = await startWorkflowRun({
    brandId: brand.id,
    organizationId: brand.organizationId,
    createdBy: input.userId,
    workflowType: PROVIDER,
    input: { ...input },
    progress: { steps },
    retryOfId: latest?.status === "failed" ? latest.id : null,
  });
  return { started, run: view(run) };
}

export async function runWanderOsImport(
  runId: string,
  input: { userId: string; brandId: string },
) {
  const run = await claimWorkflowRun(runId, PROVIDER);
  if (!run) return;
  const save = (patch: Partial<typeof workflowRunTable.$inferInsert>) =>
    updateWorkflowRun(run, patch);
  try {
    const brand = await catalogBrand(input.userId, input.brandId);
    requireCreativeFoundations(brand);
    const steps = view(run).steps;
    const authorize = () => catalogBrand(input.userId, input.brandId);
    await runWanderOsImportSteps(
      steps,
      {
        homes: async () => {
          await authorize();
          const result = await ingestBrandHomes({
            brandId: brand.id,
            website: brand.website,
          });
          if (result.failed.length)
            throw new Error(
              `${result.failed.length} homes could not be imported. ${result.failed[0]?.error ?? "Retry the import."}`,
            );
          // Save the catalog inventory and baseline cards; no AI photo/copy pass.
          await catalogState(input.userId, brand.id, true);
          return `${result.listings} homes imported`;
        },
        featured: async () => {
          await authorize();
          await db
            .insert(homeGroupTable)
            .values({
              brandId: brand.id,
              kind: "featured",
              name: "Featured homes",
            })
            .onConflictDoNothing();
          const homes = await listAllBrandHomes(brand.id);
          const existing = homes
            .filter((home) => home.featured)
            .map((home) => home.id);
          if (existing.length >= 5)
            return `${existing.length} Featured homes kept`;
          const result = await suggestFeaturedHomes({
            brandId: brand.id,
            brandName: brand.name,
            brandStory: brand.story,
            count: 5,
          });
          if (!result.picks.length)
            throw new Error(
              "No Featured homes were recommended. Retry selection.",
            );
          const additions = featuredHomeAdditions(result.picks, existing).slice(
            0,
            5 - existing.length,
          );
          for (const homeId of additions)
            await setHomeFeatured({
              homeId,
              orgId: brand.organizationId,
              featured: true,
            });
          return `${existing.length + additions.length} Featured homes selected`;
        },
        catalog: () => prepareInitialCatalog({ ...input, parentRunId: runId }),
        destinations: async () => {
          await authorize();
          const current = await db.query.brandTable.findFirst({
            where: eq(brandTable.id, brand.id),
            columns: { markets: true },
          });
          if (current?.markets?.markets.length)
            return `${current.markets.markets.length} existing destinations kept`;
          const result = await draftBrandMarkets({ brandId: brand.id });
          return `${result.markets.markets.length} destinations created`;
        },
      },
      async (steps) => {
        await save({ progress: { steps } });
      },
    );
    await save({ status: "succeeded", completedAt: new Date(), error: null });
  } catch (error) {
    await failWorkflowRun(run, error);
  }
}
