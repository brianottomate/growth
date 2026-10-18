import "server-only";
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import {
  creativeDocumentSchema,
  type CreativeDocument,
} from "@/lib/creative-document";
import { db, withTransaction } from "@/server/db";
import {
  articleRevisionTable as revisions,
  articleAcceptanceTable as acceptances,
  productionPacketTable,
} from "@/server/db/schema";
import {
  getCreativeDocument,
  lockDocument,
  assertUnlocked,
  validateCreativeAssets,
} from "./creative-document.service";
import { preserveArticleDraft } from "./article-revision-store";

type Identity = { organizationId: string; userId: string; documentId: string };
function summary(row: typeof revisions.$inferSelect) {
  return {
    id: row.id,
    title: row.document.content.title,
    source: row.source,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
    runId: row.runId,
  };
}
export async function articleHistory(
  documentId: string,
  organizationId: string,
  beforeRevisionId?: string,
) {
  const current = await getCreativeDocument(documentId, organizationId);
  if (current.document.type !== "article")
    throw new Error("Article history is available for article documents.");
  const cursor = beforeRevisionId
    ? await db.query.articleRevisionTable.findFirst({
        where: and(
          eq(revisions.id, beforeRevisionId),
          eq(revisions.documentId, documentId),
        ),
        columns: { id: true, createdAt: true },
      })
    : null;
  if (beforeRevisionId && !cursor)
    throw new Error("History cursor not found for this document.");
  const rows = await db
    .select({
      id: revisions.id,
      title: sql<string>`${revisions.document}->'content'->>'title'`,
      source: revisions.source,
      status: revisions.status,
      createdAt: revisions.createdAt,
      decidedAt: revisions.decidedAt,
      runId: revisions.runId,
    })
    .from(revisions)
    .where(
      and(
        eq(revisions.documentId, documentId),
        cursor
          ? or(
              lt(revisions.createdAt, cursor.createdAt),
              and(
                eq(revisions.createdAt, cursor.createdAt),
                lt(revisions.id, cursor.id),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(desc(revisions.createdAt), desc(revisions.id))
    .limit(51);
  const page = rows.slice(0, 50);
  const [acceptance] = await db
    .select({
      revisionId: acceptances.revisionId,
      acceptedAt: revisions.decidedAt,
    })
    .from(acceptances)
    .innerJoin(revisions, eq(revisions.id, acceptances.revisionId))
    .where(eq(acceptances.documentId, documentId));
  return {
    acceptance: acceptance
      ? {
          revisionId: acceptance.revisionId,
          acceptedAt: acceptance.acceptedAt!.toISOString(),
        }
      : null,
    revisions: page.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
    })),
    nextCursor: rows.length > 50 ? page.at(-1)!.id : null,
  };
}
export async function readArticleRevision(input: {
  organizationId: string;
  documentId: string;
  revisionId: string;
}) {
  const current = await getCreativeDocument(
    input.documentId,
    input.organizationId,
  );
  if (current.document.type !== "article")
    throw new Error("Expected an article document.");
  const [row] = await db
    .select()
    .from(revisions)
    .where(
      and(
        eq(revisions.id, input.revisionId),
        eq(revisions.documentId, input.documentId),
      ),
    );
  if (!row) throw new Error("Article revision not found.");
  return { ...summary(row), document: row.document };
}
export async function applyArticleRevision(
  input: Identity & { revisionId: string; mode: "accept" | "restore" },
) {
  return withTransaction(async (tx) => {
    const current = await lockDocument(
      tx,
      input.documentId,
      input.organizationId,
    );
    if (current.documentType !== "article")
      throw new Error("Expected an article document.");
    const [revision] = await tx
      .select()
      .from(revisions)
      .where(
        and(
          eq(revisions.id, input.revisionId),
          eq(revisions.documentId, current.id),
        ),
      )
      .for("update");
    if (!revision) throw new Error("Article revision not found.");
    if (input.mode === "accept" && revision.status === "accepted")
      return {
        documentId: current.id,
        revisionId: revision.id,
        applied: false,
      };
    if (input.mode === "accept" && revision.status !== "candidate")
      throw new Error("Only a pending candidate can be accepted.");
    if (input.mode === "restore" && revision.status === "candidate")
      throw new Error("Review and accept this candidate first.");
    await assertUnlocked(tx, current.id);
    const document = creativeDocumentSchema.parse(revision.document);
    if (document.type !== "article")
      throw new Error("Expected an article snapshot.");
    if (input.mode === "accept" && !document.content.bodyMarkdown.trim())
      throw new Error("Add article copy before accepting a candidate.");
    await validateCreativeAssets(document, current.brandId);
    await preserveArticleDraft(
      tx,
      current,
      input.mode === "accept" ? "before_accept" : "before_restore",
      input.userId,
    );
    // Restoring words must preserve the current CMS identity so the next push cannot create another item.
    const working = creativeDocumentSchema.parse(current.document);
    if (working.type === "article")
      document.content.datoItemId = working.content.datoItemId;
    await tx
      .update(productionPacketTable)
      .set({
        document,
        prompt: document.brief.direction,
        purpose: document.brief.purpose,
        updatedAt: new Date(),
      })
      .where(eq(productionPacketTable.id, current.id));
    if (input.mode === "accept") {
      await tx
        .insert(acceptances)
        .values({ documentId: current.id, revisionId: revision.id });
      await tx
        .update(revisions)
        .set({
          status: "accepted",
          decidedBy: input.userId,
          decidedAt: new Date(),
        })
        .where(eq(revisions.id, revision.id));
    }
    return { documentId: current.id, revisionId: revision.id, applied: true };
  });
}
export async function dismissArticleCandidate(
  input: Identity & { revisionId: string },
) {
  await withTransaction(async (tx) => {
    const current = await lockDocument(
      tx,
      input.documentId,
      input.organizationId,
    );
    const [revision] = await tx
      .select()
      .from(revisions)
      .where(
        and(
          eq(revisions.id, input.revisionId),
          eq(revisions.documentId, current.id),
        ),
      );
    if (!revision) throw new Error("Article revision not found.");
    if (revision.status === "dismissed") return;
    if (revision.status !== "candidate")
      throw new Error("Only a pending candidate can be dismissed.");
    await tx
      .update(revisions)
      .set({
        status: "dismissed",
        decidedBy: input.userId,
        decidedAt: new Date(),
      })
      .where(eq(revisions.id, revision.id));
  });
  return { documentId: input.documentId, revisionId: input.revisionId };
}

export async function acceptCurrentArticle(
  input: Identity & {
    reviewed: Extract<CreativeDocument, { type: "article" }>;
  },
) {
  return withTransaction(async (tx) => {
    const current = await lockDocument(
      tx,
      input.documentId,
      input.organizationId,
    );
    await assertUnlocked(tx, current.id);
    const document = creativeDocumentSchema.parse(current.document);
    if (document.type !== "article")
      throw new Error("Expected an article document.");
    const reviewed = creativeDocumentSchema.options[0].parse(input.reviewed);
    const match = await tx.execute<{ same: boolean }>(
      sql`select ${JSON.stringify(document)}::jsonb = ${JSON.stringify(reviewed)}::jsonb as same`,
    );
    if (!match.rows[0]?.same)
      throw new Error(
        "The saved article changed. Read it again before accepting it.",
      );
    if (!document.content.bodyMarkdown.trim())
      throw new Error("Add article copy before accepting the draft.");
    await validateCreativeAssets(document, current.brandId);
    const [existing] = await tx
      .select()
      .from(acceptances)
      .where(eq(acceptances.documentId, current.id));
    if (existing)
      return {
        documentId: current.id,
        revisionId: existing.revisionId,
        applied: false,
      };
    const [revision] = await tx
      .insert(revisions)
      .values({
        documentId: current.id,
        document,
        source: "editorial_review",
        status: "accepted",
        createdBy: input.userId,
        decidedBy: input.userId,
        decidedAt: new Date(),
      })
      .returning({ id: revisions.id });
    await tx
      .insert(acceptances)
      .values({ documentId: current.id, revisionId: revision!.id });
    return { documentId: current.id, revisionId: revision!.id, applied: true };
  });
}
