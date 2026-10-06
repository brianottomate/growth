import { documentForPlatform } from "@/server/services/creative-document.service";
import { requireOwnedEmailSpot } from "@/server/services/email-document.service";
import { renderDesignSystemNewsletter } from "@/server/email/newsletter-renderer-core";
import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { ORPCError } from "@orpc/server";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { z } from "zod";
import { env } from "@/env";
import { legalAddressLine } from "@/lib/brand-legal";
import { brandSendBlockers } from "@/lib/email-delivery";
import type {
  LifecycleEnrollment,
  LifecycleExecutionSettings,
  lifecycleProfileSchema,
} from "@/lib/validators/lifecycle-runtime";
import { db, withTransaction } from "@/server/db";
import {
  brandTable,
  emailSequenceTable,
  lifecycleExecutionTable as executions,
  lifecycleRevisionTable as revisions,
  lifecycleRecipientTable as recipients,
  lifecycleEnrollmentTable as enrollments,
  lifecycleDeliveryTable as deliveries,
} from "@/server/db/schema";
import { getEmailSequence } from "@/server/services/email-sequence.service";
import { assertJourneyBrand, compileJourney, contentHash } from "./compiler";
import {
  lifecycleReadiness,
  publishLifecycleDelivery,
  requireLifecycleRuntime,
} from "./providers";

export async function previewJourney(
  organizationId: string,
  sequenceId: string,
  settings: LifecycleExecutionSettings,
) {
  const program = await getEmailSequence({ organizationId, sequenceId });
  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, program.brandId),
  });
  let offset = 0;
  const errors: string[] = [];
  const compiledSteps = [];
  for (const step of program.steps) {
    offset += step.waitMinutes;
    let subject = "";
    let body = "";
    let renderedHtml = "";
    let renderedText = "";
    if (!step.platformPostId) errors.push(`${step.name}: choose an email.`);
    else {
      const spot = await requireOwnedEmailSpot(
        step.platformPostId,
        organizationId,
      );
      if (spot.brandId !== program.brandId || spot.cleanupStatus !== "keep")
        throw new ORPCError("BAD_REQUEST", {
          message: "Sequence email is unavailable for this brand.",
        });
      const selected = await documentForPlatform(
        step.platformPostId,
        organizationId,
      );
      if (selected?.document.type !== "email")
        errors.push(
          `${step.name}: open the email editor and save a draft first.`,
        );
      else {
        const document = selected.document.content;
        subject = document.subject;
        body = document.bodyMarkdown;
        if (document.productUpdate)
          errors.push(
            `${step.name}: product update templates are not supported in sequences yet; use an editorial email template.`,
          );
        const rendered = await renderDesignSystemNewsletter({
          document,
          brandName: spot.brand.name,
          logo: spot.brand.brandIdentity?.logo ?? spot.brand.logo,
          sender: spot.brand.emailSender,
          legal: spot.brand.legalIdentity,
          unsubscribeUrl: "{{{ pm:unsubscribe }}}",
        });
        renderedHtml = rendered.html;
        renderedText = rendered.text;
      }
    }
    compiledSteps.push({
      ...step,
      subject,
      body,
      renderedHtml,
      renderedText,
      delayMinutes: offset,
    });
  }
  const result = compileJourney(
    {
      ...settings,
      triggerEvent: program.triggerEvent,
      exitCondition: program.exitCondition,
      conditions: {},
    },
    compiledSteps,
    brand?.emailDelivery ?? null,
    legalAddressLine(brand?.legalIdentity),
  );
  result.errors.push(...errors);
  return result;
}
export async function prepareJourney(input: {
  organizationId: string;
  sequenceId: string;
  settings: LifecycleExecutionSettings;
  reviewedHash: string;
  userId: string;
}) {
  const preview = await previewJourney(
    input.organizationId,
    input.sequenceId,
    input.settings,
  );
  if (preview.errors.length)
    throw new ORPCError("BAD_REQUEST", { message: preview.errors.join("\n") });
  if (input.reviewedHash !== preview.contentHash)
    throw new ORPCError("CONFLICT", {
      message: "The plan changed. Preview and review it again.",
    });
  return withTransaction(async (tx) => {
    await tx
      .insert(executions)
      .values({ sequenceId: input.sequenceId })
      .onConflictDoNothing();
    const [execution] = await tx
      .select()
      .from(executions)
      .where(eq(executions.sequenceId, input.sequenceId))
      .for("update");
    if (execution!.enabled)
      throw new ORPCError("CONFLICT", {
        message: "Pause execution before preparing a replacement version.",
      });
    const [revision] = await tx
      .insert(revisions)
      .values({
        sequenceId: input.sequenceId,
        snapshot: preview.snapshot,
        contentHash: preview.contentHash,
        createdBy: input.userId,
      })
      .returning();
    await tx
      .update(executions)
      .set({ revisionId: revision!.id, updatedAt: new Date() })
      .where(eq(executions.sequenceId, input.sequenceId));
    return { revisionId: revision!.id };
  });
}
export async function executionOverview(
  organizationId: string,
  sequenceId: string,
) {
  const program = await getEmailSequence({ organizationId, sequenceId });
  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, program.brandId),
  });
  const readiness = lifecycleReadiness();
  if (brand) readiness.missing.push(...brandSendBlockers(brand));
  readiness.ready = readiness.missing.length === 0;
  const execution = await db.query.lifecycleExecutionTable.findFirst({
    where: eq(executions.sequenceId, sequenceId),
  });
  const revision = execution?.revisionId
    ? await db.query.lifecycleRevisionTable.findFirst({
        where: eq(revisions.id, execution.revisionId),
      })
    : null;
  const runs = await db
    .select({
      id: enrollments.id,
      status: enrollments.status,
      reason: enrollments.reason,
      createdAt: enrollments.createdAt,
      revisionId: enrollments.revisionId,
      email: recipients.email,
    })
    .from(enrollments)
    .innerJoin(recipients, eq(recipients.id, enrollments.recipientId))
    .where(eq(enrollments.sequenceId, sequenceId))
    .orderBy(desc(enrollments.createdAt))
    .limit(50);
  const recentDeliveries = runs.length
    ? await db
        .select({
          id: deliveries.id,
          enrollmentId: deliveries.enrollmentId,
          stepId: deliveries.stepId,
          status: deliveries.status,
          dueAt: deliveries.dueAt,
          sentAt: deliveries.sentAt,
          providerStatus: deliveries.providerStatus,
          lastError: deliveries.lastError,
        })
        .from(deliveries)
        .where(
          inArray(
            deliveries.enrollmentId,
            runs.map((r) => r.id),
          ),
        )
        .orderBy(asc(deliveries.position))
    : [];
  const runRevisions = runs.length
    ? await db
        .select({ id: revisions.id, snapshot: revisions.snapshot })
        .from(revisions)
        .where(
          inArray(revisions.id, [
            ...new Set(runs.map((run) => run.revisionId)),
          ]),
        )
    : [];
  const names = new Map(
    runRevisions.flatMap((revision) =>
      revision.snapshot.steps.map(
        (step) => [`${revision.id}:${step.id}`, step.name] as const,
      ),
    ),
  );
  const runVersions = new Map(runs.map((run) => [run.id, run.revisionId]));
  return {
    enabled: execution?.enabled ?? false,
    revision: revision ?? null,
    hasIngestToken: Boolean(execution?.ingestTokenHash),
    readiness,
    brandDelivery: brand?.emailDelivery ?? null,
    runs,
    deliveries: recentDeliveries.map((delivery) => ({
      ...delivery,
      stepName:
        names.get(
          `${runVersions.get(delivery.enrollmentId)}:${delivery.stepId}`,
        ) ?? delivery.stepId,
    })),
  };
}
export async function setExecutionEnabled(
  organizationId: string,
  sequenceId: string,
  enabled: boolean,
  expectedRevisionId?: string,
) {
  const program = await getEmailSequence({ organizationId, sequenceId });
  if (enabled) requireLifecycleRuntime();
  return withTransaction(async (tx) => {
    const [execution] = await tx
      .select()
      .from(executions)
      .where(eq(executions.sequenceId, sequenceId))
      .for("update");
    if (!execution?.revisionId)
      throw new ORPCError("BAD_REQUEST", {
        message: "Prepare a reviewed version first.",
      });
    if (enabled && execution.revisionId !== expectedRevisionId)
      throw new ORPCError("CONFLICT", {
        message:
          "The prepared version changed. Refresh and review before activating.",
      });
    if (
      enabled &&
      execution.runtimeId &&
      execution.runtimeId !== env.LIFECYCLE_RUNTIME_ID
    )
      throw new ORPCError("CONFLICT", {
        message: "This journey belongs to another delivery environment.",
      });
    if (enabled) {
      const [revision] = await tx
        .select()
        .from(revisions)
        .where(eq(revisions.id, execution.revisionId));
      const [brand] = await tx
        .select()
        .from(brandTable)
        .where(eq(brandTable.id, program.brandId));
      if (!revision || !brand) throw new ORPCError("NOT_FOUND");
      assertJourneyBrand(revision.snapshot, brand);
    }
    await tx
      .update(executions)
      .set({
        enabled,
        ...(enabled ? { runtimeId: env.LIFECYCLE_RUNTIME_ID } : {}),
        updatedAt: new Date(),
      })
      .where(eq(executions.sequenceId, sequenceId));
    return { enabled };
  });
}
export async function rotateIngestToken(
  organizationId: string,
  sequenceId: string,
) {
  await getEmailSequence({ organizationId, sequenceId });
  const token = randomBytes(32).toString("base64url");
  await db
    .insert(executions)
    .values({ sequenceId, ingestTokenHash: contentHash(token) })
    .onConflictDoUpdate({
      target: executions.sequenceId,
      set: { ingestTokenHash: contentHash(token), updatedAt: new Date() },
    });
  return { token };
}
export async function authenticateJourney(sequenceId: string, token: string) {
  const result = await db
    .select({
      hash: executions.ingestTokenHash,
      brandId: emailSequenceTable.brandId,
      organizationId: brandTable.organizationId,
    })
    .from(executions)
    .innerJoin(
      emailSequenceTable,
      eq(emailSequenceTable.id, executions.sequenceId),
    )
    .innerJoin(brandTable, eq(brandTable.id, emailSequenceTable.brandId))
    .where(
      and(
        eq(executions.sequenceId, sequenceId),
        isNull(emailSequenceTable.deletedAt),
        isNull(brandTable.deletedAt),
      ),
    )
    .limit(1);
  const scope = result[0];
  if (
    !scope?.hash ||
    !scope.organizationId ||
    !token ||
    !timingSafeEqual(Buffer.from(scope.hash), Buffer.from(contentHash(token)))
  )
    return null;
  return { brandId: scope.brandId, organizationId: scope.organizationId };
}

export async function enrollRecipient(
  organizationId: string,
  sequenceId: string,
  input: LifecycleEnrollment,
) {
  const program = await getEmailSequence({ organizationId, sequenceId });
  requireLifecycleRuntime();
  const consentAt = new Date(input.consent.recordedAt);
  if (consentAt.getTime() > Date.now())
    throw new ORPCError("BAD_REQUEST", {
      message: "Consent cannot be dated in the future.",
    });
  const hash = contentHash(input);
  const enrollmentId = await withTransaction(async (tx) => {
    // Serialize enrollment/activation changes for this program. No provider work in this transaction.
    const [execution] = await tx
      .select()
      .from(executions)
      .where(eq(executions.sequenceId, sequenceId))
      .for("update");
    const [existing] = await tx
      .select()
      .from(enrollments)
      .where(
        and(
          eq(enrollments.sequenceId, sequenceId),
          eq(enrollments.eventId, input.eventId),
        ),
      );
    if (existing) {
      if (existing.inputHash !== hash)
        throw new ORPCError("CONFLICT", {
          message: "This event ID was already used with different input.",
        });
      return existing.id;
    }
    if (
      !execution?.enabled ||
      !execution.revisionId ||
      execution.runtimeId !== env.LIFECYCLE_RUNTIME_ID
    )
      throw new ORPCError("CONFLICT", {
        message: "Journey is not active in this delivery environment.",
      });
    const [revision] = await tx
      .select()
      .from(revisions)
      .where(eq(revisions.id, execution.revisionId));
    if (
      !revision ||
      revision.snapshot.settings.triggerEvent !== input.eventName
    )
      throw new ORPCError("BAD_REQUEST", {
        message: "Event does not match the reviewed journey trigger.",
      });
    await tx
      .insert(recipients)
      .values({
        brandId: program.brandId,
        email: input.email,
        attributes: input.attributes,
        observedAt: new Date(),
        consentSource: input.consent.source,
        consentAt,
        unsubscribeToken: randomBytes(32).toString("base64url"),
      })
      .onConflictDoNothing();
    const [recipient] = await tx
      .select()
      .from(recipients)
      .where(
        and(
          eq(recipients.brandId, program.brandId),
          eq(recipients.email, input.email),
        ),
      )
      .for("update");
    if (recipient!.suppressedAt)
      throw new ORPCError("CONFLICT", {
        message: "This recipient has unsubscribed or is suppressed.",
      });
    const [activeEnrollment] = await tx
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.sequenceId, sequenceId),
          eq(enrollments.recipientId, recipient!.id),
          inArray(enrollments.status, ["active", "needs_review"]),
        ),
      )
      .limit(1);
    if (activeEnrollment)
      throw new ORPCError("CONFLICT", {
        message:
          "This recipient already has an unfinished enrollment in this journey.",
      });
    // Existing live profiles win over enrollment snapshots. Update them through the profile endpoint.
    const now = new Date();
    const [run] = await tx
      .insert(enrollments)
      .values({
        sequenceId,
        revisionId: revision.id,
        recipientId: recipient!.id,
        eventId: input.eventId,
        inputHash: hash,
        runtimeId: env.LIFECYCLE_RUNTIME_ID,
        createdAt: now,
      })
      .returning();
    await tx.insert(deliveries).values(
      revision.snapshot.steps.map((step, position) => ({
        enrollmentId: run!.id,
        stepId: step.id,
        position,
        dueAt: new Date(now.getTime() + step.delayMinutes * 60_000),
      })),
    );
    return run!.id;
  });
  // A failed publish leaves durable pending work. Retrying the same event recovers it.
  try {
    await dispatchEnrollment(enrollmentId);
    return { enrollmentId, queued: true };
  } catch {
    return { enrollmentId, queued: false };
  }
}

export async function dispatchEnrollment(enrollmentId: string) {
  const run = await db.query.lifecycleEnrollmentTable.findFirst({
    where: eq(enrollments.id, enrollmentId),
  });
  if (run?.status !== "active" || run.runtimeId !== env.LIFECYCLE_RUNTIME_ID)
    return;
  const execution = await db.query.lifecycleExecutionTable.findFirst({
    where: eq(executions.sequenceId, run.sequenceId),
  });
  if (!execution?.enabled || execution.runtimeId !== run.runtimeId) return;
  const [delivery] = await db
    .select()
    .from(deliveries)
    .where(
      and(
        eq(deliveries.enrollmentId, run.id),
        inArray(deliveries.status, ["pending", "sending", "needs_review"]),
      ),
    )
    .orderBy(asc(deliveries.position))
    .limit(1);
  if (!delivery) {
    await db
      .update(enrollments)
      .set({ status: "completed" })
      .where(and(eq(enrollments.id, run.id), eq(enrollments.status, "active")));
    return;
  }
  if (delivery.status === "needs_review") return;
  let dueAt = delivery.dueAt;
  if (delivery.position > 0) {
    const [revision, previous] = await Promise.all([
      db.query.lifecycleRevisionTable.findFirst({
        where: eq(revisions.id, run.revisionId),
      }),
      db.query.lifecycleDeliveryTable.findFirst({
        where: and(
          eq(deliveries.enrollmentId, run.id),
          eq(deliveries.position, delivery.position - 1),
        ),
      }),
    ]);
    const step = revision?.snapshot.steps[delivery.position];
    const priorStep = revision?.snapshot.steps[delivery.position - 1];
    if (step && priorStep && previous?.sentAt) {
      dueAt = new Date(
        previous.sentAt.getTime() +
          (step.delayMinutes - priorStep.delayMinutes) * 60_000,
      );
      await db
        .update(deliveries)
        .set({ dueAt })
        .where(
          and(eq(deliveries.id, delivery.id), eq(deliveries.status, "pending")),
        );
    }
  }
  let result;
  try {
    result = await publishLifecycleDelivery(delivery.id, dueAt);
  } catch (error) {
    await db
      .update(deliveries)
      .set({
        lastError:
          "Scheduling failed. Retry the enrollment event or use Recover queued work.",
      })
      .where(
        and(eq(deliveries.id, delivery.id), eq(deliveries.status, "pending")),
      );
    throw error;
  }
  await db
    .update(deliveries)
    .set({
      messageId: result.messageId,
      nextDispatchAt: result.nextDispatchAt,
      lastError: null,
    })
    .where(eq(deliveries.id, delivery.id));
}
export async function recoverJourney(
  organizationId: string,
  sequenceId: string,
  afterId?: string,
) {
  await getEmailSequence({ organizationId, sequenceId });
  requireLifecycleRuntime();
  const runs = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(
      and(
        eq(enrollments.sequenceId, sequenceId),
        eq(enrollments.status, "active"),
        eq(enrollments.runtimeId, env.LIFECYCLE_RUNTIME_ID!),
        ...(afterId ? [sql`${enrollments.id} > ${afterId}`] : []),
      ),
    )
    .orderBy(asc(enrollments.id))
    .limit(51);
  let queued = 0;
  let failed = 0;
  for (const run of runs.slice(0, 50)) {
    try {
      await dispatchEnrollment(run.id);
      queued++;
    } catch {
      failed++;
    }
  }
  return { queued, failed, nextCursor: runs.length > 50 ? runs[49]!.id : null };
}
export async function cancelEnrollment(
  organizationId: string,
  sequenceId: string,
  enrollmentId: string,
) {
  await getEmailSequence({ organizationId, sequenceId });
  await db
    .update(enrollments)
    .set({ status: "cancelled", reason: "Cancelled by operator" })
    .where(
      and(
        eq(enrollments.id, enrollmentId),
        eq(enrollments.sequenceId, sequenceId),
        inArray(enrollments.status, ["active", "needs_review"]),
      ),
    );
  return { cancelled: true };
}
export async function updateRecipientProfile(
  organizationId: string,
  sequenceId: string,
  input: z.infer<typeof lifecycleProfileSchema>,
) {
  const program = await getEmailSequence({ organizationId, sequenceId });
  const observedAt = new Date(input.observedAt);
  if (observedAt.getTime() > Date.now() + 60_000)
    throw new ORPCError("BAD_REQUEST", {
      message: "Profile timestamp is in the future.",
    });
  const rows = await db
    .update(recipients)
    .set({ attributes: input.attributes, observedAt })
    .where(
      and(
        eq(recipients.brandId, program.brandId),
        eq(recipients.email, input.email),
        sql`${recipients.observedAt} < ${observedAt}`,
      ),
    )
    .returning({ id: recipients.id });
  // Withdrawal is monotonic and applies even when an older profile event arrives late.
  if (input.unsubscribe)
    await db
      .update(recipients)
      .set({ suppressedAt: new Date(), suppressionReason: "Consent withdrawn" })
      .where(
        and(
          eq(recipients.brandId, program.brandId),
          eq(recipients.email, input.email),
          isNull(recipients.suppressedAt),
        ),
      );
  return { updated: rows.length > 0 };
}
export async function unsubscribeRecipient(token: string) {
  await db
    .update(recipients)
    .set({ suppressedAt: new Date(), suppressionReason: "Unsubscribed" })
    .where(
      and(
        eq(recipients.unsubscribeToken, token),
        isNull(recipients.suppressedAt),
      ),
    );
}
