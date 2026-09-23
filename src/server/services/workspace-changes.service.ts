import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  assistantRunTable as runs,
  assistantToolReceiptTable as receipts,
} from "@/server/db/schema";
import { workspaceDomains } from "@/lib/workspace-changes";

/** Completed write receipts form a durable feed shared by native, MCP and background operations. */
export async function readWorkspaceChanges(
  organizationId: string,
  since: Date,
) {
  const now = new Date();
  // Replay a short overlap to cover commit/response races. Clients deduplicate revisions.
  const from = new Date(
    Math.max(since.getTime() - 30_000, now.getTime() - 24 * 60 * 60_000),
  );
  const rows = await db
    .select({
      tool: receipts.toolName,
      revision: sql<string>`max(${receipts.finishedAt})::text`,
    })
    .from(receipts)
    .innerJoin(runs, eq(runs.id, receipts.runId))
    .where(
      and(
        eq(runs.organizationId, organizationId),
        gte(receipts.finishedAt, from),
        sql`${receipts.policy}->>'consequence' in ('local-write', 'model-write', 'provider-write', 'background-run')`,
        // An accepted job has not changed domain state. Its worker emits its own receipt.
        sql`coalesce(${receipts.output}->'data'->>'status', '') <> 'started'`,
      ),
    )
    .groupBy(receipts.toolName);
  return {
    cursor: now.toISOString(),
    changes: rows.map((row) => ({
      ...row,
      domains: workspaceDomains(row.tool),
    })),
  };
}
