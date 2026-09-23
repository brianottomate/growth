/** Real receipt/job/feed boundaries on an isolated DB. No provider calls. */
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import {
  organizationTable,
  userTable,
  memberTable,
  assistantRunTable,
} from "@/server/db/schema";
import { growthTool, type GrowthTool } from "@/server/ai/kernel/tool";
import {
  startOperationJob,
  readOperationJob,
} from "@/server/ai/kernel/operation-jobs";
import { readWorkspaceChanges } from "@/server/services/workspace-changes.service";
import { NATIVE_TOOLS } from "@/server/ai/capabilities";
assert(
  process.env.OUTPUT_QA_HOST &&
    new URL(process.env.DATABASE_URL!).hostname === process.env.OUTPUT_QA_HOST,
  "Isolated branch required",
);
const suffix = crypto.randomUUID();
const orgId = `jobs_qa_org_${suffix}`,
  userId = `jobs_qa_user_${suffix}`;
const context = { orgId, userId, runId: "fixture", surface: "test" as const };
const since = new Date();
const name = "sourceSyncWrite__syncWebsite";
let executions = 0;
let fail = false;
const tool = growthTool({
  description: "Provider-free fixture exercising real execution boundaries",
  inputSchema: z.object({}),
  resultSchema: z.object({
    ok: z.literal(true),
    action: z.literal("syncWebsite"),
    data: z.object({
      discovered: z.number(),
      rollups: z.number(),
      sitemapUrl: z.string(),
      stored: z.number(),
    }),
  }),
  execute: async () => {
    executions++;
    if (fail) throw Error("Fixture provider failure");
    return {
      ok: true as const,
      action: "syncWebsite" as const,
      data: {
        discovered: 1,
        rollups: 1,
        sitemapUrl: "https://example.com/sitemap.xml",
        stored: 1,
      },
    };
  },
}) as unknown as GrowthTool;
let checks = 0;
const pass = (label: string) => {
  checks++;
  console.log(`PASS ${label}`);
};
try {
  await db.insert(userTable).values({ id: userId, name: "Job QA" });
  await db.insert(organizationTable).values({ id: orgId, name: "Job QA" });
  await db.insert(memberTable).values({ userId, organizationId: orgId });
  let work: (() => Promise<void>) | undefined;
  const started = await startOperationJob(
    name,
    tool,
    {},
    context,
    (callback) => {
      work = callback;
    },
  );
  assert.equal(executions, 0);
  assert.equal(
    (await readOperationJob(started.runId, context)).status,
    "running",
  );
  assert.equal((await readWorkspaceChanges(orgId, since)).changes.length, 0);
  pass("acceptance is pending and creates no domain change notification");
  await work!();
  const completed = await NATIVE_TOOLS.operationRead__status!.run(
    { runId: started.runId },
    context,
  );
  assert(
    NATIVE_TOOLS.operationRead__status!.resultSchema.safeParse(completed)
      .success,
  );
  assert.equal(
    (await readOperationJob(started.runId, context)).status,
    "completed",
  );
  await work!();
  assert.equal(executions, 1);
  pass(
    "completed result validates and worker replay cannot repeat the operation",
  );
  const feed = await readWorkspaceChanges(orgId, since);
  assert(
    feed.changes.some(
      (change) => change.tool === name && change.domains.length > 0,
    ),
  );
  assert.equal(
    (await readWorkspaceChanges("another-org", since)).changes.length,
    0,
  );
  pass("completed worker emits scoped domain changes");
  await assert.rejects(() =>
    readOperationJob(started.runId, { ...context, orgId: "other" }),
  );
  await assert.rejects(() =>
    readOperationJob(started.runId, { ...context, userId: "other" }),
  );
  pass("job result access requires initiating organization and user");
  fail = true;
  const failed = await startOperationJob(
    name,
    tool,
    {},
    context,
    (callback) => {
      work = callback;
    },
  );
  await work!();
  const failure = await readOperationJob(failed.runId, context);
  assert.equal(failure.status, "failed");
  assert(
    "result" in failure &&
      failure.result &&
      typeof failure.result === "object" &&
      "ok" in failure.result &&
      failure.result.ok === false,
  );
  pass("worker failure retains the error receipt");
  const interrupted = await startOperationJob(name, tool, {}, context, () => {
    /* Simulate worker termination before execution. */
  });
  await db
    .update(assistantRunTable)
    .set({ startedAt: new Date(Date.now() - 7 * 60_000) })
    .where(eq(assistantRunTable.id, interrupted.runId));
  assert.equal(
    (await readOperationJob(interrupted.runId, context)).status,
    "interrupted",
  );
  pass("worker termination is exposed without automatic retry");
  await assert.rejects(() =>
    startOperationJob(name, tool, {}, context, () => {
      throw Error("schedule unavailable");
    }),
  );
  pass("scheduling failure is propagated");
  fail = false;
  const revoked = await startOperationJob(
    name,
    tool,
    {},
    context,
    (callback) => {
      work = callback;
    },
  );
  const before = executions;
  await db.delete(memberTable).where(eq(memberTable.userId, userId));
  await work!();
  assert.equal(executions, before);
  assert.equal(
    (await readOperationJob(revoked.runId, context)).status,
    "failed",
  );
  pass("worker rechecks membership before executing");
  console.log(JSON.stringify({ operationChecks: checks, providerCalls: 0 }));
} finally {
  await db.delete(organizationTable).where(eq(organizationTable.id, orgId));
  await db.delete(userTable).where(eq(userTable.id, userId));
  console.log("QA fixtures removed");
}
