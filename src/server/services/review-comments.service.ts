import "server-only";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { db } from "@/server/db";
import {
  adTable,
  brandTable,
  contentCommentTable,
  contentPostTable,
  homeTable,
  userTable,
} from "@/server/db/schema";
import type { ReviewTarget } from "@/lib/review-target";
import type { GrowthActionContext } from "@/server/ai/kernel/tool";

export async function assertReviewSubject(target: ReviewTarget, orgId: string) {
  const subject =
    target.type === "ad"
      ? await db.query.adTable.findFirst({
          where: eq(adTable.id, target.id),
          columns: { brandId: true },
        })
      : target.type === "catalog"
        ? await db.query.homeTable.findFirst({
            where: and(
              isNull(homeTable.deletedAt),
              target.brandId
                ? and(
                    eq(homeTable.brandId, target.brandId),
                    or(
                      eq(homeTable.id, target.id),
                      eq(homeTable.externalId, target.id),
                    ),
                  )
                : eq(homeTable.id, target.id),
            ),
            columns: { id: true, brandId: true },
          })
        : await db.query.contentPostTable.findFirst({
            where: eq(contentPostTable.id, target.id),
            columns: { brandId: true },
          });
  const brand =
    subject?.brandId &&
    (await db.query.brandTable.findFirst({
      where: and(
        eq(brandTable.id, subject.brandId),
        eq(brandTable.organizationId, orgId),
        isNull(brandTable.deletedAt),
      ),
      columns: { id: true },
    }));
  if (!brand) throw new Error("Review item not found in this workspace.");
  return {
    ...brand,
    target:
      target.type === "catalog" && subject && "id" in subject
        ? { ...target, id: subject.id as string }
        : target,
  };
}
export function reviewSubjectFields(target: ReviewTarget) {
  return target.type === "ad"
    ? { adId: target.id }
    : target.type === "catalog"
      ? { homeId: target.id }
      : { contentPostId: target.id };
}
function subjectCondition(target: ReviewTarget) {
  return eq(
    target.type === "ad"
      ? contentCommentTable.adId
      : target.type === "catalog"
        ? contentCommentTable.homeId
        : contentCommentTable.contentPostId,
    target.id,
  );
}
export function reviewActor(
  ctx: GrowthActionContext,
  as: "user" | "agent" = "agent",
) {
  return {
    authorId: ctx.userId,
    actorKind: ctx.surface === "app" ? ("user" as const) : as,
    viaAgent: ctx.surface !== "app",
    agentRunId: ctx.surface === "app" ? null : ctx.runId,
  };
}
export async function listReviewComments(target: ReviewTarget, orgId: string) {
  const subject = await assertReviewSubject(target, orgId);
  const rows = await db
    .select({
      id: contentCommentTable.id,
      body: contentCommentTable.body,
      createdAt: contentCommentTable.createdAt,
      authorId: contentCommentTable.authorId,
      actorKind: contentCommentTable.actorKind,
      viaAgent: contentCommentTable.viaAgent,
      event: contentCommentTable.event,
      authorName: userTable.name,
      authorImage: userTable.image,
    })
    .from(contentCommentTable)
    .leftJoin(userTable, eq(userTable.id, contentCommentTable.authorId))
    .where(
      and(
        subjectCondition(subject.target),
        isNull(contentCommentTable.deletedAt),
      ),
    )
    .orderBy(desc(contentCommentTable.createdAt), desc(contentCommentTable.id))
    .limit(100);
  return rows.reverse().map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    author: {
      id: row.authorId,
      name: row.authorName,
      image: row.authorImage,
    },
  }));
}
export async function addReviewComment(
  input: { target: ReviewTarget; body: string; as?: "user" | "agent" },
  ctx: GrowthActionContext,
) {
  const subject = await assertReviewSubject(input.target, ctx.orgId);
  const [row] = await db
    .insert(contentCommentTable)
    .values({
      ...reviewSubjectFields(subject.target),
      ...reviewActor(ctx, input.as),
      body: input.body,
    })
    .returning({ id: contentCommentTable.id });
  return { id: row!.id };
}
export async function deleteReviewComment(
  id: string,
  ctx: GrowthActionContext,
) {
  const row = await db.query.contentCommentTable.findFirst({
    where: eq(contentCommentTable.id, id),
  });
  if (!row || row.authorId !== ctx.userId || row.event !== "comment")
    throw new Error("Comment not found or not yours to remove.");
  const target: ReviewTarget | null = row.adId
    ? { type: "ad", id: row.adId }
    : row.homeId
      ? { type: "catalog", id: row.homeId }
      : row.contentPostId
        ? { type: "content", id: row.contentPostId }
        : null;
  if (!target) throw new Error("Unsupported comment subject.");
  await assertReviewSubject(target, ctx.orgId);
  await db
    .update(contentCommentTable)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(contentCommentTable.id, id),
        eq(contentCommentTable.authorId, ctx.userId),
      ),
    );
  return { id };
}
