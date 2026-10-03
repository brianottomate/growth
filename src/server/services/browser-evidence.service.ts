import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import {
  browserEvidenceRunSchema,
  type BrowserEvidenceRun,
} from "@/lib/browser-evidence";
import { GrowthActionError } from "@/server/ai/kernel/errors";
import { db, withTransaction } from "@/server/db";
import { brandTable, contentIngestRunTable } from "@/server/db/schema";

const mode = "browser_evidence";
async function requireBrand(brandId: string, orgId: string) {
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, brandId),
      eq(brandTable.organizationId, orgId),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true },
  });
  if (!brand)
    throw new GrowthActionError(
      "not_found",
      "Brand unavailable in this workspace",
    );
}

/** Retain manual evidence separately from the global mention queue. */
export async function recordBrowserEvidence(
  input: BrowserEvidenceRun,
  context: { orgId: string; userId: string },
) {
  const payload = browserEvidenceRunSchema.parse(input);
  await requireBrand(payload.brandId, context.orgId);
  const inputHash = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
  return withTransaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`browser-evidence:${payload.brandId}:${payload.runKey}`}))`,
    );
    const [existing] = await tx
      .select()
      .from(contentIngestRunTable)
      .where(
        and(
          eq(contentIngestRunTable.brandId, payload.brandId),
          eq(contentIngestRunTable.mode, mode),
          sql`${contentIngestRunTable.result}->>'runKey' = ${payload.runKey}`,
        ),
      )
      .limit(1);
    if (existing) {
      if (existing.result?.inputHash !== inputHash)
        throw new GrowthActionError(
          "conflict",
          "Run key already records different evidence",
        );
      return {
        id: existing.id,
        replayed: true,
        count: payload.captures.length,
        outcome: payload.outcome,
      };
    }
    const [row] = await tx
      .insert(contentIngestRunTable)
      .values({
        brandId: payload.brandId,
        requestedById: context.userId,
        mode,
        provider: "manual_browser",
        status: payload.outcome,
        startedAt: new Date(payload.startedAt),
        completedAt: new Date(payload.finishedAt),
        result: { version: 1, runKey: payload.runKey, inputHash, payload },
      })
      .returning({ id: contentIngestRunTable.id });
    if (!row) throw new Error("Evidence record was not saved");
    return {
      id: row.id,
      replayed: false,
      count: payload.captures.length,
      outcome: payload.outcome,
    };
  });
}

export async function readBrowserEvidence(
  input: { brandId: string; runId?: string; limit: number },
  orgId: string,
) {
  await requireBrand(input.brandId, orgId);
  const rows = await db
    .select()
    .from(contentIngestRunTable)
    .where(
      and(
        eq(contentIngestRunTable.brandId, input.brandId),
        eq(contentIngestRunTable.mode, mode),
        input.runId ? eq(contentIngestRunTable.id, input.runId) : undefined,
      ),
    )
    .orderBy(desc(contentIngestRunTable.startedAt))
    .limit(input.runId ? 1 : input.limit);
  return {
    runs: rows.map((row) => {
      const payload = browserEvidenceRunSchema.parse(row.result?.payload);
      return {
        id: row.id,
        runKey: payload.runKey,
        outcome: payload.outcome,
        startedAt: payload.startedAt,
        finishedAt: payload.finishedAt,
        report: payload.report,
        count: payload.captures.length,
        captures: input.runId ? payload.captures : [],
      };
    }),
  };
}
