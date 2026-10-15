import "server-only";
import { runPerformanceBookingNotification } from "./performance-booking-notification.service";
import { runPerformanceStageNotification } from "./performance-stage-notification.service";
import { and, asc, eq, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { workflowRunTable } from "@/server/db/schema";
import { starterGenerationSchema } from "@/lib/starter-ad-generation";
import type { CatalogDraft, CatalogHome } from "@/lib/catalog-studio";
import { CATALOG_WRITE_PASSES } from "@/lib/catalog-studio";
import { catalogBrand, renderCatalogExport } from "./catalog-studio.service";
import { runCatalogWrite } from "./catalog-quick-fix.service";
import { runStarterGeneration } from "./starter-ad-generation.service";
import { runWanderOsImport } from "./wanderos-import.service";
import { runCreativeWriting } from "./creative-writing.service";
import { runEmailGenerationJob } from "./email-document.service";
import { expireWorkflowRuns } from "./workflow-run.service";

/** Recovery only claims never-started jobs. Running provider work is never replayed. */
export async function recoverQueuedWorkflows() {
  await expireWorkflowRuns();
  const rows = await db.query.workflowRunTable.findMany({
    where: and(
      eq(workflowRunTable.status, "queued"),
      isNull(workflowRunTable.parentRunId),
      lt(workflowRunTable.createdAt, new Date(Date.now() - 60_000)),
    ),
    orderBy: asc(workflowRunTable.createdAt),
    limit: 3,
  });
  await Promise.all(
    rows.map(async (run) => {
      try {
        if (run.workflowType === "performance-booking-notification") {
          await runPerformanceBookingNotification(run.id);
          return;
        }
        if (run.workflowType === "performance-stage-notification") {
          await runPerformanceStageNotification(run.id);
          return;
        }
        if (!run.createdBy) throw new Error("The operator no longer exists");
        const brand = await catalogBrand(run.createdBy, run.brandId);
        if (brand.organizationId !== run.organizationId)
          throw new Error("Workflow workspace changed");
        if (run.workflowType === "starter-ads") {
          await runStarterGeneration(run.id, {
            ...starterGenerationSchema.parse(run.input),
            organizationId: run.organizationId,
          });
          return;
        }
        const identity = { userId: run.createdBy, brandId: run.brandId };
        switch (run.workflowType) {
          case "wanderos-import":
            await runWanderOsImport(run.id, identity);
            break;
          case "catalog-write":
            await runCatalogWrite(run.id, {
              ...identity,
              pass: z.enum(CATALOG_WRITE_PASSES).parse(run.input.pass),
              homeIds: z.array(z.string()).parse(run.input.homeIds),
            });
            break;
          case "catalog-export":
            await renderCatalogExport(
              {
                run,
                brand,
                draft: run.input.draft as CatalogDraft,
                homes: run.input.homes as CatalogHome[],
              },
              run.createdBy,
            );
            break;
          case "creative-document":
            if (run.provider !== "anthropic" || run.operation !== "write")
              throw new Error(
                "Provider dispatch was interrupted. Start a new run from the document.",
              );
            if (run.kind === "email") await runEmailGenerationJob(run.id);
            else await runCreativeWriting(run.id);
            break;
          default:
            throw new Error("Unknown workflow type");
        }
      } catch (error) {
        await db
          .update(workflowRunTable)
          .set({
            status: "failed",
            completedAt: new Date(),
            error: error instanceof Error ? error.message : "Dispatch failed",
          })
          .where(
            and(
              eq(workflowRunTable.id, run.id),
              eq(workflowRunTable.status, "queued"),
            ),
          );
      }
    }),
  );
  return { inspected: rows.length };
}
