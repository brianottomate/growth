import "server-only";
import { ORPCError } from "@orpc/server";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import type { EmailSequenceDraft } from "@/lib/validators/email-sequence";
import { EMAIL_DOCUMENT_FORMATS } from "@/lib/email-document";
import { db, withTransaction } from "@/server/db";
import {
  brandTable,
  emailSequenceTable as sequences,
  emailSequenceStepTable as steps,
  lifecycleExecutionTable as executions,
  lifecycleEnrollmentTable as enrollments,
  platformPostTable,
} from "@/server/db/schema";

async function requireBrand(organizationId: string, brandId: string) {
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, brandId),
      eq(brandTable.organizationId, organizationId),
      isNull(brandTable.deletedAt),
    ),
  });
  if (!brand)
    throw new ORPCError("NOT_FOUND", {
      message: "Brand not found in this workspace.",
    });
  return brand;
}
export async function getEmailSequence(input: {
  organizationId: string;
  sequenceId: string;
}) {
  const [sequence] = await db
    .select({ sequence: sequences })
    .from(sequences)
    .innerJoin(brandTable, eq(brandTable.id, sequences.brandId))
    .where(
      and(
        eq(sequences.id, input.sequenceId),
        eq(brandTable.organizationId, input.organizationId),
        isNull(brandTable.deletedAt),
        isNull(sequences.deletedAt),
      ),
    );
  if (!sequence)
    throw new ORPCError("NOT_FOUND", {
      message: "Sequence not found in this workspace.",
    });
  const rows = await db
    .select()
    .from(steps)
    .where(eq(steps.sequenceId, input.sequenceId))
    .orderBy(asc(steps.position));
  return { ...sequence.sequence, steps: rows };
}
export async function listEmailSequences(
  organizationId: string,
  brandId: string,
) {
  await requireBrand(organizationId, brandId);
  return db
    .select({
      id: sequences.id,
      name: sequences.name,
      description: sequences.description,
      triggerEvent: sequences.triggerEvent,
      updatedAt: sequences.updatedAt,
      enabled: executions.enabled,
      revisionId: executions.revisionId,
    })
    .from(sequences)
    .leftJoin(executions, eq(executions.sequenceId, sequences.id))
    .where(and(eq(sequences.brandId, brandId), isNull(sequences.deletedAt)))
    .orderBy(desc(sequences.updatedAt));
}
export async function listSequenceEmails(
  organizationId: string,
  brandId: string,
) {
  const brand = await requireBrand(organizationId, brandId);
  const emails = await db.query.platformPostTable.findMany({
    where: and(
      eq(platformPostTable.brandId, brandId),
      eq(platformPostTable.source, "owned"),
      eq(platformPostTable.platform, "newsletter"),
      inArray(platformPostTable.format, [...EMAIL_DOCUMENT_FORMATS]),
      eq(platformPostTable.cleanupStatus, "keep"),
    ),
    columns: { id: true, text: true, status: true },
    with: { contentPost: { columns: { title: true } } },
  });
  return {
    emails: emails.map((e) => ({
      id: e.id,
      title: e.contentPost?.title ?? e.text ?? "Untitled email",
      status: e.status,
    })),
    sender: brand.emailSender,
  };
}
export async function saveEmailSequence(input: {
  organizationId: string;
  brandId: string;
  sequenceId?: string;
  draft: EmailSequenceDraft;
}) {
  await requireBrand(input.organizationId, input.brandId);
  // Email references are checked independently of sequence ownership.
  const emailIds = [
    ...new Set(
      input.draft.steps.flatMap((s) =>
        s.platformPostId ? [s.platformPostId] : [],
      ),
    ),
  ];
  if (emailIds.length) {
    const allowed = await db
      .select({ id: platformPostTable.id })
      .from(platformPostTable)
      .where(
        and(
          inArray(platformPostTable.id, emailIds),
          eq(platformPostTable.brandId, input.brandId),
          eq(platformPostTable.source, "owned"),
          eq(platformPostTable.platform, "newsletter"),
          inArray(platformPostTable.format, [...EMAIL_DOCUMENT_FORMATS]),
          eq(platformPostTable.cleanupStatus, "keep"),
        ),
      );
    if (allowed.length !== emailIds.length)
      throw new ORPCError("BAD_REQUEST", {
        message:
          "Every email must belong to this brand and be available in the email editor.",
      });
  }
  return withTransaction(async (tx) => {
    const { steps: draftSteps, ...fields } = input.draft;
    let sequenceId = input.sequenceId;
    let version = 1;
    if (sequenceId) {
      const [current] = await tx
        .select()
        .from(sequences)
        .where(
          and(
            eq(sequences.id, sequenceId),
            eq(sequences.brandId, input.brandId),
            isNull(sequences.deletedAt),
          ),
        )
        .for("update");
      if (!current) throw new ORPCError("NOT_FOUND");
      version = current.version + 1;
      await tx
        .update(sequences)
        .set({ ...fields, version, updatedAt: new Date() })
        .where(eq(sequences.id, sequenceId));
      await tx.delete(steps).where(eq(steps.sequenceId, sequenceId));
    } else {
      const [created] = await tx
        .insert(sequences)
        .values({ ...fields, brandId: input.brandId })
        .returning();
      sequenceId = created!.id;
    }
    if (draftSteps.length)
      await tx.insert(steps).values(
        draftSteps.map((step, position) => ({
          ...step,
          sequenceId,
          position,
        })),
      );
    return { id: sequenceId, version };
  });
}
export async function archiveEmailSequence(
  organizationId: string,
  sequenceId: string,
) {
  await getEmailSequence({ organizationId, sequenceId });
  await withTransaction(async (tx) => {
    await tx
      .update(sequences)
      .set({ deletedAt: new Date() })
      .where(eq(sequences.id, sequenceId));
    await tx
      .update(executions)
      .set({ enabled: false, updatedAt: new Date() })
      .where(eq(executions.sequenceId, sequenceId));
    await tx
      .update(enrollments)
      .set({ status: "cancelled", reason: "Sequence archived" })
      .where(
        and(
          eq(enrollments.sequenceId, sequenceId),
          inArray(enrollments.status, ["active", "needs_review"]),
        ),
      );
  });
  return { archived: true };
}
