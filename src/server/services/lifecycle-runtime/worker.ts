import { websiteEmailOptOuts } from "@/server/services/email-opt-outs.service";
import { isOptedOut, personalUnsubscribe } from "@/server/email/unsubscribe";
import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { env } from "@/env";
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
import {
  assertJourneyBrand,
  matchesCondition,
  renderLifecycleEmail,
} from "./compiler";
import { requireLifecycleRuntime, sendLifecycleEmail } from "./providers";
import { canRunJourney, isTestJourney } from "./test-policy";
import { dispatchEnrollment } from "./service";

// Postmark has no send idempotency contract here. Once a provider attempt
// starts, an uncertain outcome must never automatically send again.
const LEASE_MS = 2 * 60 * 1000;

export async function executeLifecycleDelivery(
  deliveryId: string,
  runtimeId: string,
) {
  requireLifecycleRuntime();
  if (runtimeId !== env.LIFECYCLE_RUNTIME_ID)
    throw new Error("Wrong lifecycle delivery environment");
  const initial = await db.query.lifecycleDeliveryTable.findFirst({
    where: eq(deliveries.id, deliveryId),
  });
  if (!initial) return { status: "not_found" };
  // External consent is read before claiming a provider attempt. A transient
  // lookup failure can be retried safely because no email request has started.
  let externallySuppressed = false;
  if (
    initial.status === "pending" &&
    !initial.firstAttemptAt &&
    initial.dueAt.getTime() <= Date.now()
  ) {
    const [scope] = await db
      .select({
        brandId: brandTable.id,
        websiteId: brandTable.wanderOsWebsiteId,
        email: recipients.email,
        snapshot: revisions.snapshot,
      })
      .from(enrollments)
      .innerJoin(
        emailSequenceTable,
        eq(emailSequenceTable.id, enrollments.sequenceId),
      )
      .innerJoin(brandTable, eq(brandTable.id, emailSequenceTable.brandId))
      .innerJoin(recipients, eq(recipients.id, enrollments.recipientId))
      .innerJoin(revisions, eq(revisions.id, enrollments.revisionId))
      .where(
        and(
          eq(enrollments.id, initial.enrollmentId),
          eq(enrollments.status, "active"),
          eq(enrollments.runtimeId, runtimeId),
        ),
      );
    // Like blast test sends, an operator-requested direct test does not enroll
    // a guest in marketing. Only the immutable, recipient-bound test revision
    // can skip the customer-list lookup; local and Postmark suppression remain.
    if (scope && !isTestJourney(scope.snapshot, scope.email))
      externallySuppressed =
        (await isOptedOut(scope.brandId, scope.email)) ||
        (scope.websiteId
          ? (await websiteEmailOptOuts(scope.websiteId)).has(scope.email)
          : false);
  }
  const claim = await withTransaction(async (tx) => {
    const [run] = await tx
      .select()
      .from(enrollments)
      .where(eq(enrollments.id, initial.enrollmentId))
      .for("update");
    if (run?.status !== "active" || run.runtimeId !== runtimeId)
      return { status: "inactive" } as const;
    const [execution] = await tx
      .select()
      .from(executions)
      .where(eq(executions.sequenceId, run.sequenceId));
    const [program] = await tx
      .select({
        deletedAt: emailSequenceTable.deletedAt,
        brandDeletedAt: brandTable.deletedAt,
        brand: brandTable,
      })
      .from(emailSequenceTable)
      .innerJoin(brandTable, eq(brandTable.id, emailSequenceTable.brandId))
      .where(eq(emailSequenceTable.id, run.sequenceId));
    const [recipient] = await tx
      .select()
      .from(recipients)
      .where(eq(recipients.id, run.recipientId));
    const [revision] = await tx
      .select()
      .from(revisions)
      .where(eq(revisions.id, run.revisionId));
    if (
      !program ||
      program.deletedAt ||
      program.brandDeletedAt ||
      !recipient ||
      !revision ||
      recipient.suppressedAt ||
      externallySuppressed
    ) {
      await tx
        .update(enrollments)
        .set({
          status: "cancelled",
          reason: "Recipient suppressed or sequence archived",
        })
        .where(eq(enrollments.id, run.id));
      return { status: "cancelled" } as const;
    }
    if (
      !canRunJourney(revision.snapshot, recipient.email, execution, runtimeId)
    )
      return { status: "paused" } as const;
    const test = isTestJourney(revision.snapshot, recipient.email);
    const attributes = test
      ? revision.snapshot.test!.attributes
      : recipient.attributes;
    const exitCondition = revision.snapshot.settings.exitCondition;
    if (exitCondition && matchesCondition(exitCondition, attributes)) {
      await tx
        .update(enrollments)
        .set({ status: "cancelled", reason: "Exit condition met" })
        .where(eq(enrollments.id, run.id));
      return { status: "cancelled" } as const;
    }
    const [delivery] = await tx
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
    if (!delivery || delivery.id !== deliveryId)
      return { status: "advance", enrollmentId: run.id } as const;
    if (delivery.status === "needs_review")
      return { status: "needs_review" } as const;
    if (delivery.position > 0) {
      const [previous] = await tx
        .select()
        .from(deliveries)
        .where(
          and(
            eq(deliveries.enrollmentId, run.id),
            eq(deliveries.position, delivery.position - 1),
          ),
        );
      const step = revision.snapshot.steps[delivery.position];
      const priorStep = revision.snapshot.steps[delivery.position - 1];
      if (step && priorStep && previous?.sentAt) {
        const earliest = new Date(
          previous.sentAt.getTime() +
            (step.delayMinutes - priorStep.delayMinutes) * 60_000,
        );
        if (earliest.getTime() > Date.now()) {
          await tx
            .update(deliveries)
            .set({ dueAt: earliest })
            .where(eq(deliveries.id, delivery.id));
          return { status: "advance", enrollmentId: run.id } as const;
        }
      }
    }
    if (delivery.dueAt.getTime() > Date.now())
      return { status: "advance", enrollmentId: run.id } as const;
    if (delivery.leaseUntil && delivery.leaseUntil.getTime() > Date.now())
      throw new Error("Delivery is already being processed");
    const step = revision.snapshot.steps.find((s) => s.id === delivery.stepId);
    if (!step) throw new Error("Delivery step missing from immutable revision");
    const needsReview = async (reason: string) => {
      await tx
        .update(deliveries)
        .set({ status: "needs_review", lastError: reason })
        .where(eq(deliveries.id, delivery.id));
      await tx
        .update(enrollments)
        .set({ status: "needs_review", reason })
        .where(eq(enrollments.id, run.id));
      return { status: "needs_review" } as const;
    };
    if (delivery.firstAttemptAt)
      return needsReview(
        "Postmark send outcome is uncertain. Inspect its receipt before taking action; automatic resend is disabled.",
      );
    try {
      assertJourneyBrand(revision.snapshot, program.brand);
    } catch (error) {
      return needsReview(
        error instanceof Error
          ? error.message
          : "Brand delivery is unavailable",
      );
    }
    let parentSent = true;
    if (step.parentStepId) {
      const [parent] = await tx
        .select({ status: deliveries.status })
        .from(deliveries)
        .where(
          and(
            eq(deliveries.enrollmentId, run.id),
            eq(deliveries.stepId, step.parentStepId),
          ),
        );
      parentSent = parent?.status === "sent";
    }
    if (
      !parentSent ||
      (step.condition && !matchesCondition(step.condition, attributes))
    ) {
      await tx
        .update(deliveries)
        .set({
          status: "skipped",
          lastError: parentSent
            ? "Condition not met"
            : "Parent step did not send",
        })
        .where(eq(deliveries.id, delivery.id));
      return { status: "advance", enrollmentId: run.id } as const;
    }
    let payload = delivery.payload;
    if (!payload) {
      try {
        payload = {
          ...renderLifecycleEmail({
            snapshot: revision.snapshot,
            step,
            attributes,
            email: recipient.email,
            deliveryId: delivery.id,
          }),
          unsubscribe: personalUnsubscribe(recipient.brandId, recipient.email),
        };
      } catch (error) {
        return needsReview(
          error instanceof Error ? error.message : "Email rendering failed",
        );
      }
    }
    if (test && !delivery.payload)
      payload = { ...payload, subject: `[Test] ${payload.subject}` };
    const leaseToken = randomUUID();
    await tx
      .update(deliveries)
      .set({
        status: "sending",
        payload,
        firstAttemptAt: delivery.firstAttemptAt ?? new Date(),
        leaseToken,
        leaseUntil: new Date(Date.now() + LEASE_MS),
        lastError: null,
      })
      .where(eq(deliveries.id, delivery.id));
    return {
      status: "send",
      payload,
      test,
      leaseToken,
      enrollmentId: run.id,
    } as const;
  });
  if (claim.status === "advance") {
    await dispatchEnrollment(claim.enrollmentId);
    return { status: "scheduled" };
  }
  if (claim.status !== "send") return claim;
  try {
    const providerEmailId = await sendLifecycleEmail(
      claim.payload,
      deliveryId,
      claim.test,
    );
    await db
      .update(deliveries)
      .set({
        status: "sent",
        providerEmailId,
        sentAt: new Date(),
        leaseUntil: null,
        leaseToken: null,
        lastError: null,
      })
      .where(
        and(
          eq(deliveries.id, deliveryId),
          eq(deliveries.leaseToken, claim.leaseToken),
        ),
      );
  } catch {
    // A timeout or a lost DB acknowledgement may mean Postmark accepted mail.
    // Never return this row to pending: QStash retries must not resend it.
    await withTransaction(async (tx) => {
      await tx
        .update(deliveries)
        .set({
          status: "needs_review",
          leaseUntil: null,
          leaseToken: null,
          lastError:
            "Postmark acceptance was not confirmed. Inspect the provider before any manual resend.",
        })
        .where(
          and(
            eq(deliveries.id, deliveryId),
            eq(deliveries.leaseToken, claim.leaseToken),
          ),
        );
      await tx
        .update(enrollments)
        .set({
          status: "needs_review",
          reason: "Postmark send requires review",
        })
        .where(
          and(
            eq(enrollments.id, claim.enrollmentId),
            eq(enrollments.status, "active"),
          ),
        );
    });
    return { status: "needs_review" };
  }
  // If this publish fails, QStash retries the original job; the ledger prevents another send.
  await dispatchEnrollment(claim.enrollmentId);
  return { status: "sent" };
}
