import "server-only";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { env, envSelect } from "@/env";
import {
  PIPELINE_COLUMNS,
  type PipelineStage,
} from "@/lib/performance-pipeline";
import { performanceConnectionLines } from "@/lib/performance-connections";
import { postOnSlack, escapeSlackMrkdwn } from "@/server/clients/slack.client";
import { db, type Database, type TransactionClient } from "@/server/db";
import { brandTable, workflowRunTable } from "@/server/db/schema";
import { loadPerformanceConnections } from "./performance-connections.service";
import {
  claimWorkflowRun,
  failWorkflowRun,
  updateWorkflowRun,
} from "./workflow-run.service";

const TYPE = "performance-stage-notification";
const text = (value: string) =>
  escapeSlackMrkdwn(value).replace(/@/g, "@\u200b");

/** Same transaction as the stage change: a rollback cannot send a handoff. */
export async function queuePerformanceStageNotification(
  client: Database | TransactionClient,
  input: {
    brandId: string;
    orgId: string;
    userId: string | null;
    by: string | null;
    from: PipelineStage;
    to: PipelineStage;
  },
) {
  if (
    input.from === input.to ||
    !["launch_prep", "delivery"].includes(input.to)
  )
    return;
  const [run] = await client
    .insert(workflowRunTable)
    .values({
      brandId: input.brandId,
      organizationId: input.orgId,
      createdBy: input.userId,
      workflowType: TYPE,
      lockKey: crypto.randomUUID(),
      input,
      status: "queued",
      expiresAt: new Date(Date.now() + 2 * 60 * 60_000),
    })
    .returning();
  if (run) after(() => runPerformanceStageNotification(run.id));
}

export async function runPerformanceStageNotification(runId: string) {
  const run = await claimWorkflowRun(runId, TYPE);
  if (!run) return;
  try {
    const brand = await db.query.brandTable.findFirst({
      where: eq(brandTable.id, run.brandId),
      columns: { name: true, slug: true, organizationId: true },
    });
    if (!brand || brand.organizationId !== run.organizationId)
      throw new Error("Handoff brand is no longer in this workspace.");
    const stage = typeof run.input.to === "string" ? run.input.to : "";
    const creative = stage === "launch_prep";
    if (!creative && stage !== "delivery")
      throw new Error("Unknown handoff stage");
    const mentions = envSelect({
      prod: creative ? "<@U079BTC73JB> <@U07ECB9RVCJ>" : "<@U093SKRUB8S>",
      test: creative ? "Brian and Silvina" : "Brooke",
    });
    const base = `https://growth-red.vercel.app/app/performance/clients/${encodeURIComponent(brand.slug ?? run.brandId)}`;
    const summary = (
      await loadPerformanceConnections(run.organizationId, [run.brandId])
    ).get(run.brandId);
    const previous =
      PIPELINE_COLUMNS.find((column) => column.id === run.input.from)?.name ??
      "Unknown";
    const body = [
      `${mentions} — *${text(brand.name)}* moved into *${creative ? "Creative" : "Delivery"}*.`,
      `Moved by ${text(typeof run.input.by === "string" ? run.input.by : "the team")} · Previously: ${text(previous)}`,
      ...(summary
        ? performanceConnectionLines(summary).map(
            (line) => `*${line.label}:* ${text(line.value)}`,
          )
        : ["Connection status unavailable"]),
      summary?.clientSetupComplete
        ? "Client-owned Zernio + Meta setup complete"
        : "Client-owned Zernio + Meta setup incomplete",
      `<${base}|Client> · <${base}/ads|Ad Studio> · <${base}/catalog|Catalog> · <${base}/newsletters|Email> · <${base}/settings|Connections>`,
    ].join("\n");
    if (!env.SLACK_API_TOKEN) throw new Error("SLACK_API_TOKEN not configured");
    const result = await postOnSlack({
      channel: "C0BSSECHK08",
      text: body,
      unfurl_links: false,
      unfurl_media: false,
    });
    if (!result.success) throw new Error(result.error);
    await updateWorkflowRun(run, {
      status: "succeeded",
      progress: {
        channel: result.channel,
        messageTs: result.ts,
        message: "Slack handoff sent",
      },
    });
  } catch (error) {
    await failWorkflowRun(run, error);
  }
}
