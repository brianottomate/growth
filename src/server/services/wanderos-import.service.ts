import {
  startWorkflowRun,
  claimWorkflowRun,
  updateWorkflowRun,
  failWorkflowRun,
  expireWorkflowRuns,
} from "./workflow-run.service";
import { prepareInitialCatalog } from "./catalog-quick-fix.service";
import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, withTransaction } from "@/server/db";
import {
  brandTable,
  workflowRunTable,
  homeGroupMemberTable,
  homeGroupTable,
  personaTable,
  adTable,
  platformPostTable,
  contentPostTable,
} from "@/server/db/schema";
import { suggestBrandPersonas } from "./persona-suggestions.service";
import { primaryHomeIds } from "./home-groups.service";
import { createEmailSlot } from "./email-document.service";
import { draftNewsletterFromTemplate } from "./newsletter-template.service";
import {
  startStarterGeneration,
  runStarterGeneration,
} from "./starter-ad-generation.service";
import {
  initialImportSteps,
  runWanderOsImportSteps,
  wanderOsImportStepSchema,
} from "@/lib/wanderos-import";
import { featuredHomeAdditions } from "@/lib/featured-home-selection";
import {
  catalogBrand,
  catalogState,
  prepareInitialCatalogAdCopy,
} from "./catalog-studio.service";
import { ingestBrandHomes } from "./homes.service";
import {
  changeGroupHomes,
  makePrimaryGroup,
  sourceGroup,
} from "./home-groups.service";
import { suggestFeaturedHomes } from "./featured-home-suggestions.service";
import { draftBrandMarkets } from "./brand-markets.service";

import { missingCreativeFoundations } from "@/lib/brand-creative-readiness";
import { starterGenerationSchema } from "@/lib/starter-ad-generation";

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
    needsPreparation: Boolean(
      run?.status === "succeeded" &&
      view(run).steps.some((step) => step.status !== "ready"),
    ),
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
  const { run: latest, needsPreparation } = await wanderOsImportStatus(input);
  const resume = latest && (latest.status === "failed" || needsPreparation);
  const previous = resume
    ? await db.query.workflowRunTable.findFirst({
        where: eq(workflowRunTable.id, latest.id),
      })
    : null;
  const steps = resume
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
    progress: { ...previous?.progress, steps },
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
    const progress: Record<string, unknown> = { ...run.progress, steps };
    const checkpoint = () => save({ progress });
    const authorize = () => catalogBrand(input.userId, input.brandId);
    await runWanderOsImportSteps(
      steps,
      {
        personas: async () => {
          await authorize();
          const existing = await db.query.personaTable.findMany({
            where: and(
              eq(personaTable.brandId, brand.id),
              isNull(personaTable.deletedAt),
            ),
            columns: { id: true },
          });
          if (existing.length)
            return `${existing.length} existing personas kept`;
          const { suggestions } = await suggestBrandPersonas(
            { brandId: brand.id },
            brand.organizationId,
          );
          if (!suggestions.length)
            throw new Error(
              "No personas could be grounded in the brand story.",
            );
          await db
            .insert(personaTable)
            .values(
              suggestions.map((persona) => ({ ...persona, brandId: brand.id })),
            );
          return `${suggestions.length} planning personas created`;
        },
        ads: async () => {
          await authorize();
          const priorRunId =
            typeof progress.starterRunId === "string"
              ? progress.starterRunId
              : null;
          const prior = priorRunId
            ? await db.query.workflowRunTable.findFirst({
                where: and(
                  eq(workflowRunTable.id, priorRunId),
                  eq(workflowRunTable.brandId, brand.id),
                ),
              })
            : null;
          if (prior?.status === "succeeded")
            return `${Number(prior.progress.created ?? 0)} starter ads drafted`;
          if (prior?.status === "queued") {
            await runStarterGeneration(prior.id, {
              ...starterGenerationSchema.parse(prior.input),
              organizationId: brand.organizationId,
            });
            const resumed = await db.query.workflowRunTable.findFirst({
              where: eq(workflowRunTable.id, prior.id),
            });
            if (resumed?.status !== "succeeded")
              throw new Error(
                resumed?.error ?? "Starter ads did not complete.",
              );
            return `${Number(resumed.progress.created ?? 0)} unapproved starter ads drafted`;
          }
          if (prior?.status === "running")
            throw new Error(
              "Starter ads are still running. Wait for that generation before retrying the import.",
            );
          const existing = await db.query.adTable.findFirst({
            where: and(
              eq(adTable.brandId, brand.id),
              isNull(adTable.campaignId),
              eq(adTable.type, "creative"),
            ),
            columns: { id: true },
          });
          if (existing)
            return prior?.status === "failed"
              ? "Saved Ad Studio drafts kept after interruption; review and finish them in Ad Studio"
              : "Existing Ad Studio drafts kept";
          const homeIds = [...(await primaryHomeIds(brand.id))].slice(0, 5);
          if (!homeIds.length)
            throw new Error(
              "Select Featured homes before drafting starter ads.",
            );
          const args = {
            brandId: brand.id,
            organizationId: brand.organizationId,
            userId: input.userId,
            parentRunId: run.id,
            source: "featured" as const,
            homeIds,
            intendedPlacements: [
              "facebook-feed",
              "instagram-feed",
              "instagram-story",
            ] as const,
          };
          const generation = await startStarterGeneration({
            ...args,
            intendedPlacements: [...args.intendedPlacements],
          });
          progress.starterRunId = generation.runId;
          await checkpoint();
          await runStarterGeneration(generation.runId, {
            ...args,
            intendedPlacements: [...args.intendedPlacements],
          });
          const result = await db.query.workflowRunTable.findFirst({
            where: eq(workflowRunTable.id, generation.runId),
          });
          if (result?.status !== "succeeded")
            throw new Error(
              result?.error ?? "Starter ad generation did not complete.",
            );
          return `${Number(result.progress.created ?? 0)} unapproved starter ads drafted`;
        },
        broadcast: async () => {
          await authorize();
          let platformPostId =
            typeof progress.broadcastPostId === "string"
              ? progress.broadcastPostId
              : null;
          if (!platformPostId) {
            const existing = await db
              .select({ id: platformPostTable.id })
              .from(platformPostTable)
              .innerJoin(
                contentPostTable,
                eq(contentPostTable.id, platformPostTable.contentPostId),
              )
              .where(
                and(
                  eq(platformPostTable.brandId, brand.id),
                  eq(platformPostTable.platform, "newsletter"),
                  isNull(contentPostTable.seriesId),
                  isNull(contentPostTable.deletedAt),
                ),
              )
              .limit(1);
            if (existing.length) return "Existing standalone broadcast kept";
            const slot = await createEmailSlot({
              organizationId: brand.organizationId,
              userId: input.userId,
              brandId: brand.id,
              title: `${brand.name}: your next getaway`,
              format: "newsletter.broadcast",
              purpose:
                "First standalone guest broadcast introducing the brand and its Featured homes. Unscheduled draft for human review.",
              ctaText: "Explore the homes",
            });
            platformPostId = slot.platformPostId;
            progress.broadcastPostId = platformPostId;
            await checkpoint();
          }
          await draftNewsletterFromTemplate({
            organizationId: brand.organizationId,
            userId: input.userId,
            brandId: brand.id,
            platformPostId,
            template: "home-collection",
            homeIds: [...(await primaryHomeIds(brand.id))].slice(0, 5),
            brief:
              "Draft the first standalone broadcast for human review from the saved brand story and Featured homes. Introduce the brand with real home photos and booking links. Keep it evergreen and unscheduled. No invented discounts, availability, prices or events. No newsletter series or sequence.",
          });
          return "One unscheduled broadcast drafted for human review";
        },
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
          // Our suggestion lives in its own group beside any client's picks,
          // and only leads when the brand has no primary group yet.
          const group = await withTransaction(async (tx) => {
            const suggested = await sourceGroup(tx, brand.id, "suggested");
            const [primary] = await tx
              .select({ id: homeGroupTable.id })
              .from(homeGroupTable)
              .where(
                and(
                  eq(homeGroupTable.brandId, brand.id),
                  eq(homeGroupTable.isPrimary, true),
                ),
              );
            if (!primary) await makePrimaryGroup(tx, brand.id, suggested.id);
            return suggested;
          });
          const existing = (
            await db
              .select({ homeId: homeGroupMemberTable.homeId })
              .from(homeGroupMemberTable)
              .where(eq(homeGroupMemberTable.groupId, group.id))
          ).map((row) => row.homeId);
          if (existing.length >= 5)
            return `${existing.length} ${group.name} kept`;
          const result = await suggestFeaturedHomes({
            brandId: brand.id,
            brandName: brand.name,
            brandStory: brand.story,
            creativeDirection: brand.creativeDirection,
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
          if (additions.length)
            await changeGroupHomes(
              { groupId: group.id, homeIds: additions, operation: "add" },
              brand.organizationId,
            );
          return `${existing.length + additions.length} ${group.name} selected`;
        },
        catalog: async () => {
          await prepareInitialCatalogAdCopy(input);
          return prepareInitialCatalog({ ...input, parentRunId: runId });
        },
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
        progress.steps = steps;
        await checkpoint();
      },
    );
    await save({ status: "succeeded", completedAt: new Date(), error: null });
  } catch (error) {
    await failWorkflowRun(run, error);
  }
}
