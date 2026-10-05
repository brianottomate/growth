import { prepareInitialCatalog } from "./catalog-quick-fix.service";
import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, withTransaction } from "@/server/db";
import {
  brandTable,
  creativeRunTable,
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

const PROVIDER = "wanderos-import";
const STALE_MS = 15 * 60 * 1000;
const whereRun = (brandId: string) =>
  and(
    eq(creativeRunTable.brandId, brandId),
    eq(creativeRunTable.provider, PROVIDER),
  );
function view(run: typeof creativeRunTable.$inferSelect) {
  const stale =
    ["queued", "processing"].includes(run.status) &&
    Date.now() - run.createdAt.getTime() > STALE_MS;
  const parsed = wanderOsImportStepSchema
    .array()
    .safeParse(run.providerOutput?.steps);
  return {
    id: run.id,
    status:
      stale || run.status === "cancelled" ? ("error" as const) : run.status,
    steps: initialImportSteps().map((step) =>
      parsed.success
        ? (parsed.data.find((saved) => saved.step === step.step) ?? step)
        : step,
    ),
    error: stale
      ? "Import was interrupted. Retry to continue unfinished steps."
      : run.error,
  };
}
export async function wanderOsImportStatus(input: {
  userId: string;
  brandId: string;
}) {
  await catalogBrand(input.userId, input.brandId);
  const run = await db.query.creativeRunTable.findFirst({
    where: whereRun(input.brandId),
    orderBy: [desc(creativeRunTable.createdAt)],
  });
  return { run: run ? view(run) : null };
}
export async function startWanderOsImport(input: {
  userId: string;
  brandId: string;
}) {
  const brand = await catalogBrand(input.userId, input.brandId);
  return withTransaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`wanderos-import:${brand.id}`}))`,
    );
    const [previous] = await tx
      .select()
      .from(creativeRunTable)
      .where(whereRun(brand.id))
      .orderBy(desc(creativeRunTable.createdAt))
      .limit(1);
    const latest = previous ? view(previous) : null;
    if (latest && ["queued", "processing"].includes(latest.status))
      return { started: false, run: latest };
    const steps =
      latest?.status === "error"
        ? latest.steps.map((step) =>
            step.status === "ready"
              ? step
              : { ...step, status: "pending" as const, message: "" },
          )
        : initialImportSteps();
    const [run] = await tx
      .insert(creativeRunTable)
      .values({
        brandId: brand.id,
        organizationId: brand.organizationId,
        createdBy: input.userId,
        provider: PROVIDER,
        kind: "image",
        model: "wanderos-setup",
        prompt: "Import homes, select Featured homes, and create destinations",
        input: {},
        providerOutput: { steps },
      })
      .returning();
    return { started: true, run: view(run!) };
  });
}
export async function runWanderOsImport(
  runId: string,
  input: { userId: string; brandId: string },
) {
  const save = (patch: Partial<typeof creativeRunTable.$inferInsert>) =>
    db
      .update(creativeRunTable)
      .set(patch)
      .where(and(eq(creativeRunTable.id, runId), whereRun(input.brandId)));
  try {
    const brand = await catalogBrand(input.userId, input.brandId);
    const run = await db.query.creativeRunTable.findFirst({
      where: and(eq(creativeRunTable.id, runId), whereRun(brand.id)),
    });
    if (run?.status !== "queued") return;
    // Claim before doing work so duplicate dispatch cannot run the same workflow.
    const claimed = await db
      .update(creativeRunTable)
      .set({ status: "processing" })
      .where(
        and(
          eq(creativeRunTable.id, runId),
          eq(creativeRunTable.status, "queued"),
        ),
      )
      .returning({ id: creativeRunTable.id });
    if (!claimed.length) return;
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
        catalog: () => prepareInitialCatalog(input),
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
        await save({ providerOutput: { steps } });
      },
    );
    await save({ status: "ready", completedAt: new Date(), error: null });
  } catch (error) {
    await save({
      status: "error",
      error: error instanceof Error ? error.message : "Import failed",
      completedAt: new Date(),
    });
  }
}
