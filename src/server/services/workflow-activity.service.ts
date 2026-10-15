import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { workflowRunTable } from "@/server/db/schema";
import type { WorkflowActivityRun } from "@/lib/workflow-run";
import {
  WANDEROS_IMPORT_LABELS,
  wanderOsImportStepSchema,
} from "@/lib/wanderos-import";
import { catalogBrand } from "./catalog-studio.service";
import { recentWorkflowRuns } from "./workflow-run.service";

const names: Record<
  string,
  { title: string; destination: string; path: string; unit: string }
> = {
  "meta-connect-confirmation": {
    title: "Confirming Meta connection",
    destination: "Settings",
    path: "settings",
    unit: "connections",
  },
  "performance-booking-notification": {
    title: "Slack booking alert",
    destination: "Client",
    path: "",
    unit: "messages",
  },
  "performance-stage-notification": {
    title: "Slack stage handoff",
    destination: "Client",
    path: "",
    unit: "messages",
  },
  "platform-push": {
    title: "Pushing campaign",
    destination: "Campaign",
    path: "campaigns",
    unit: "ads",
  },
  "starter-ads": {
    title: "Generating ads",
    destination: "Ad studio",
    path: "ads",
    unit: "ads",
  },
  "wanderos-import": {
    title: "Importing WanderOS",
    destination: "WanderOS",
    path: "wanderos",
    unit: "steps",
  },
  "catalog-write": {
    title: "Preparing catalog",
    destination: "Catalog",
    path: "catalog",
    unit: "cards",
  },
  "catalog-export": {
    title: "Exporting catalog",
    destination: "Catalog",
    path: "catalog",
    unit: "images",
  },
  "creative-document": {
    title: "Producing document",
    destination: "Document",
    path: "",
    unit: "outputs",
  },
};

export async function workflowActivity(userId: string, brandId: string) {
  const brand = await catalogBrand(userId, brandId);
  const runs = await recentWorkflowRuns(brand.id);
  // Explicit public projection: never expose prompts, tokens, or provider payloads.
  return runs.map((run): WorkflowActivityRun => {
    const kind = names[run.workflowType] ?? names["creative-document"]!;
    const p = run.progress;
    const steps = wanderOsImportStepSchema.array().safeParse(p.steps);
    const completed = Number(p.completed ?? p.created ?? p.done ?? 0);
    const total = Number(p.total ?? 0);
    return {
      id: run.id,
      title: kind.title,
      destination: kind.destination,
      href: run.packetId
        ? `/app/creative/${run.packetId}`
        : `/app/performance/clients/${brand.slug ?? brand.id}/${kind.path}${run.workflowType === "platform-push" && run.campaignId ? `/${run.campaignId}#campaign-platforms` : ""}`,
      status: run.status,
      message:
        typeof p.message === "string"
          ? p.message
          : run.status === "queued"
            ? "Waiting to start"
            : "",
      ...(Number.isFinite(total) && total > 0
        ? {
            count: {
              completed: Number.isFinite(completed) ? completed : 0,
              total,
              unit: kind.unit,
            },
          }
        : {}),
      ...(steps.success
        ? {
            steps: steps.data.map((step) => ({
              title: WANDEROS_IMPORT_LABELS[step.step],
              status:
                step.status === "ready"
                  ? "succeeded"
                  : step.status === "error"
                    ? "failed"
                    : step.status === "processing"
                      ? "running"
                      : "queued",
            })),
          }
        : {}),
      ...(run.error ? { issue: run.error } : {}),
      dismissed: Boolean(run.dismissedAt),
      parentRunId: run.parentRunId,
      updatedAt: run.updatedAt.toISOString(),
    };
  });
}

export async function dismissWorkflow(
  userId: string,
  brandId: string,
  runId: string,
) {
  const brand = await catalogBrand(userId, brandId);
  await db
    .update(workflowRunTable)
    .set({ dismissedAt: new Date() })
    .where(
      and(
        eq(workflowRunTable.id, runId),
        eq(workflowRunTable.brandId, brand.id),
        eq(workflowRunTable.organizationId, brand.organizationId),
        inArray(workflowRunTable.status, ["succeeded", "failed", "cancelled"]),
      ),
    );
  return { dismissed: true };
}
