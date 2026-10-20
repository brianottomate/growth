import "server-only";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { env } from "@/env";
import { db, withTransaction } from "@/server/db";
import { messageSendTable, platformPostTable } from "@/server/db/schema";
import { emailDocumentDraftSchema } from "@/lib/email-document";
import { brandSendBlockers } from "@/lib/email-delivery";
import { canOperateEmailDelivery } from "@/lib/email-delivery-role";
import {
  broadcastCanPause,
  broadcastCanRecover,
  broadcastJobCanRun,
  broadcastQueueReceiptCanAttach,
  shouldPauseSupersededBroadcast,
  shouldPersistBroadcastJobFailure,
  type BroadcastScheduleApprovalInput,
  type BroadcastScheduleInput,
} from "@/lib/broadcast-schedule";
import {
  ensureEmailDocument,
  requireOwnedEmailSpot,
} from "./email-document.service";
import { getEmailAudience } from "./email-audience.service";
import { dispatchBrandSend } from "./brand-email-send.service";
import { getWanderMembership } from "@/server/wander-workspace";
import {
  lifecycleReadiness,
  publishEmailJob,
  requireLifecycleRuntime,
} from "./lifecycle-runtime/providers";
import { requireEmailDeliveryOperator } from "./email-delivery-authorization.service";

type Actor = { organizationId: string; userId: string };
const sha = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function ownedSend(id: string, actor: Actor) {
  const send = await db.query.messageSendTable.findFirst({
    where: eq(messageSendTable.id, id),
  });
  if (send?.provider !== "postmark")
    throw new Error("Postmark send not found.");
  const spot = await requireOwnedEmailSpot(
    send.platformPostId,
    actor.organizationId,
  );
  return { send, spot };
}

export async function previewBroadcastSchedule(
  input: BroadcastScheduleInput,
  actor: Actor,
) {
  const seen = new Set<string>();
  const posts = new Set<string>();
  const sends = [];
  for (const item of input.sends) {
    if (seen.has(item.messageSendId))
      throw new Error("Choose each prepared send once.");
    seen.add(item.messageSendId);
    const { send, spot } = await ownedSend(item.messageSendId, actor);
    if (spot.brandId !== input.brandId)
      throw new Error("Every send must belong to the selected brand.");
    if (posts.has(spot.id))
      throw new Error("Choose one prepared send per email.");
    posts.add(spot.id);
    if (!["draft", "approved"].includes(send.status))
      throw new Error(
        "Only unstarted draft or approved sends can be scheduled.",
      );
    if (!["approved", "scheduled", "published"].includes(spot.status))
      throw new Error("Approve the email creative first.");
    const dueAt = new Date(item.scheduledAt).toISOString();
    if (Date.parse(dueAt) <= Date.now())
      throw new Error("Choose future send times.");
    const blockers = brandSendBlockers(spot.brand);
    if (blockers.length) throw new Error(blockers.join(" "));
    const { document } = await ensureEmailDocument({
      platformPostId: spot.id,
      ...actor,
    });
    if (sha(emailDocumentDraftSchema.parse(document)) !== send.contentHash)
      throw new Error("The email changed. Prepare it again.");
    const audience = send.snapshot.audience;
    if (audience.provider !== "postmark")
      throw new Error("A Postmark audience is required.");
    const selectedAudience = await getEmailAudience(
      { audienceId: audience.audienceId },
      actor,
    );
    if (
      selectedAudience.brandId !== spot.brandId ||
      !selectedAudience.definition.consentConfirmed
    )
      throw new Error(
        "The audience must belong to this brand and have marketing permission.",
      );
    sends.push({
      messageSendId: send.id,
      platformPostId: spot.id,
      contentHash: send.contentHash,
      subject: send.snapshot.email.subject,
      html: send.snapshot.preview.html,
      text: send.snapshot.preview.text,
      sender: send.snapshot.sender ?? null,
      audience: send.snapshot.audience,
      recipientCount: selectedAudience.recipientCount,
      membership: "live" as const,
      scheduledAt: dueAt,
      localTime: new Intl.DateTimeFormat("en-US", {
        timeZone: input.timeZone,
        dateStyle: "full",
        timeStyle: "short",
      }).format(new Date(dueAt)),
    });
  }
  return {
    sends,
    reviewedHash: sha({
      brandId: input.brandId,
      timeZone: input.timeZone,
      sends: sends.map(({ recipientCount: _recipientCount, ...send }) => send),
    }),
    readiness: lifecycleReadiness(),
  };
}

async function persistActiveQueueFailure(
  input: { messageSendId: string; dueAt: string; runtimeId: string },
  error: unknown,
) {
  await withTransaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(messageSendTable)
      .where(eq(messageSendTable.id, input.messageSendId))
      .for("update");
    if (
      !current ||
      !shouldPersistBroadcastJobFailure(
        { status: current.status, schedule: current.snapshot.schedule },
        input,
      )
    )
      return;
    const message =
      error instanceof Error ? error.message : "Queue publication failed";
    await tx
      .update(messageSendTable)
      .set({
        error: `Queue publication failed: ${message}`,
        updatedAt: new Date(),
      })
      .where(eq(messageSendTable.id, current.id));
  });
}

async function queueSend(
  messageSendId: string,
  dueAt: string,
  runtimeId: string,
) {
  let receipt;
  try {
    receipt = await publishEmailJob({
      path: "/api/jobs/email-broadcast",
      failurePath: "/api/jobs/email-broadcast/failure",
      retries: 0,
      key: `broadcast-${messageSendId}-${Date.parse(dueAt)}`,
      body: { messageSendId, dueAt, runtimeId },
      dueAt: new Date(dueAt),
    });
  } catch (error) {
    await persistActiveQueueFailure({ messageSendId, dueAt, runtimeId }, error);
    throw error;
  }
  // Scheduled is a queue receipt, not an approval or a calendar date.
  const send = await db.query.messageSendTable.findFirst({
    where: eq(messageSendTable.id, messageSendId),
  });
  if (!send) return { receipt, authoritative: false };
  const authoritative = await withTransaction(async (tx) => {
    const [post] = await tx
      .select()
      .from(platformPostTable)
      .where(eq(platformPostTable.id, send.platformPostId))
      .for("update");
    const [current] = await tx
      .select()
      .from(messageSendTable)
      .where(eq(messageSendTable.id, send.id))
      .for("update");
    if (!current || !post) return false;
    const schedule = current.snapshot.schedule;
    if (
      !schedule ||
      !broadcastQueueReceiptCanAttach(
        { status: current.status, schedule },
        { dueAt, runtimeId },
        post.status,
      )
    )
      return false;
    await tx
      .update(messageSendTable)
      .set({
        snapshot: {
          ...current.snapshot,
          schedule: {
            ...schedule,
            state: "scheduled",
            queueMessageId: receipt.messageId,
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(messageSendTable.id, current.id));
    await tx
      .update(platformPostTable)
      .set({ status: "scheduled" })
      .where(eq(platformPostTable.id, post.id));
    return true;
  });
  return { receipt, authoritative };
}

export async function scheduleBroadcasts(
  input: BroadcastScheduleApprovalInput,
  actor: Actor,
) {
  await requireEmailDeliveryOperator(actor);
  if (input.customerIoStopped !== true)
    throw new Error(
      "Confirm that conflicting Customer.io sends have stopped before scheduling.",
    );
  requireLifecycleRuntime();
  const preview = await previewBroadcastSchedule(input, actor);
  if (preview.reviewedHash !== input.reviewedHash)
    throw new Error("The reviewed sends changed. Preview them again.");
  const runtimeId = env.LIFECYCLE_RUNTIME_ID!;
  await withTransaction(async (tx) => {
    // One approval covers exactly this set. No series membership is copied or invented.
    for (const item of [...preview.sends].sort((a, b) =>
      a.platformPostId.localeCompare(b.platformPostId),
    )) {
      const [post] = await tx
        .select()
        .from(platformPostTable)
        .where(eq(platformPostTable.id, item.platformPostId))
        .for("update");
      if (
        !post ||
        !["approved", "scheduled", "published"].includes(post.status)
      )
        throw new Error("Creative approval changed. Review this email again.");
      const [send] = await tx
        .select()
        .from(messageSendTable)
        .where(eq(messageSendTable.id, item.messageSendId))
        .for("update");
      if (
        !send ||
        !["draft", "approved"].includes(send.status) ||
        send.contentHash !== item.contentHash
      )
        throw new Error("A send already started or changed.");
      const siblings = await tx
        .select()
        .from(messageSendTable)
        .where(eq(messageSendTable.platformPostId, item.platformPostId))
        .for("update");
      for (const sibling of siblings) {
        const siblingSchedule = sibling.snapshot.schedule;
        if (
          !siblingSchedule ||
          !shouldPauseSupersededBroadcast(send.id, {
            id: sibling.id,
            status: sibling.status,
            schedule: siblingSchedule,
          })
        )
          continue;
        await tx
          .update(messageSendTable)
          .set({
            snapshot: {
              ...sibling.snapshot,
              schedule: { ...siblingSchedule, state: "paused" },
            },
            updatedAt: new Date(),
          })
          .where(eq(messageSendTable.id, sibling.id));
      }
      await tx
        .update(messageSendTable)
        .set({
          status: "approved",
          approvedBy: actor.userId,
          approvedAt: new Date(),
          error: null,
          snapshot: {
            ...send.snapshot,
            schedule: {
              dueAt: item.scheduledAt,
              timeZone: input.timeZone,
              runtimeId,
              state: "approved",
              customerIoStopped: true,
            },
          },
          updatedAt: new Date(),
        })
        .where(eq(messageSendTable.id, send.id));
      await tx
        .update(platformPostTable)
        .set({ scheduledAt: new Date(item.scheduledAt), status: "approved" })
        .where(eq(platformPostTable.id, item.platformPostId));
    }
  });
  const results = [];
  for (const item of preview.sends) {
    try {
      const queued = await queueSend(
        item.messageSendId,
        item.scheduledAt,
        runtimeId,
      );
      results.push({
        messageSendId: item.messageSendId,
        queued: queued.authoritative,
      });
    } catch {
      results.push({ messageSendId: item.messageSendId, queued: false });
    }
  }
  return { sends: results };
}

export async function pauseBroadcast(messageSendId: string, actor: Actor) {
  await requireEmailDeliveryOperator(actor);
  const { send } = await ownedSend(messageSendId, actor);
  await withTransaction(async (tx) => {
    const [post] = await tx
      .select()
      .from(platformPostTable)
      .where(eq(platformPostTable.id, send.platformPostId))
      .for("update");
    const [current] = await tx
      .select()
      .from(messageSendTable)
      .where(eq(messageSendTable.id, send.id))
      .for("update");
    const schedule = current?.snapshot.schedule;
    if (
      !current ||
      !schedule ||
      !broadcastCanPause({
        status: current.status,
        schedule,
      })
    )
      throw new Error("No active schedule to pause.");
    await tx
      .update(messageSendTable)
      .set({
        snapshot: {
          ...current.snapshot,
          schedule: { ...schedule, state: "paused" },
        },
        updatedAt: new Date(),
      })
      .where(eq(messageSendTable.id, send.id));
    if (post?.status === "scheduled")
      await tx
        .update(platformPostTable)
        .set({ status: "approved" })
        .where(eq(platformPostTable.id, post.id));
  });
  return { paused: true };
}

export async function broadcastScheduleStatus(
  messageSendId: string,
  actor: Actor,
) {
  const { send } = await ownedSend(messageSendId, actor);
  return {
    messageSendId: send.id,
    status: send.status,
    schedule: send.snapshot.schedule ?? null,
    error: send.error,
  };
}

/** Recovery only republishes unstarted, approved work. Never retries uncertain provider attempts. */
export async function recoverBroadcast(messageSendId: string, actor: Actor) {
  await requireEmailDeliveryOperator(actor);
  const { send } = await ownedSend(messageSendId, actor);
  const schedule = send.snapshot.schedule;
  if (
    !schedule ||
    !broadcastCanRecover(
      { status: send.status, schedule },
      env.LIFECYCLE_RUNTIME_ID,
    )
  )
    throw new Error(
      "Only an unstarted active schedule can be recovered. Investigate attempted sends separately.",
    );
  const queued = await queueSend(send.id, schedule.dueAt, schedule.runtimeId);
  if (!queued.authoritative)
    throw new Error(
      "The schedule changed before its recovery receipt could be saved.",
    );
  return { queued: true };
}

/** Called only after verifying the QStash callback's signature and source. */
export async function recordBroadcastQueueFailure(input: {
  messageSendId: string;
  dueAt: string;
  runtimeId: string;
  sourceMessageId: string;
}) {
  if (input.runtimeId !== env.LIFECYCLE_RUNTIME_ID) return;
  await withTransaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(messageSendTable)
      .where(eq(messageSendTable.id, input.messageSendId))
      .for("update");
    if (
      !current ||
      !shouldPersistBroadcastJobFailure(
        { status: current.status, schedule: current.snapshot.schedule },
        input,
      )
    )
      return;
    const [post] = await tx
      .select({ status: platformPostTable.status })
      .from(platformPostTable)
      .where(eq(platformPostTable.id, current.platformPostId))
      .for("update");
    await tx
      .update(messageSendTable)
      .set({
        status: "failed",
        error:
          "QStash delivery failed before Postmark handoff. Check the dead-letter queue before preparing a new send.",
        failedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(messageSendTable.id, current.id));
    if (post?.status === "scheduled")
      await tx
        .update(platformPostTable)
        .set({ status: "approved" })
        .where(eq(platformPostTable.id, current.platformPostId));
  });
}

export async function executeBroadcastJob(input: {
  messageSendId: string;
  dueAt: string;
  runtimeId: string;
}) {
  if (input.runtimeId !== env.LIFECYCLE_RUNTIME_ID)
    return { status: "inactive" };
  requireLifecycleRuntime();
  const send = await db.query.messageSendTable.findFirst({
    where: eq(messageSendTable.id, input.messageSendId),
  });
  if (
    send?.status !== "approved" ||
    !broadcastJobCanRun(send.snapshot.schedule, input)
  )
    return { status: "inactive" };
  if (!send.approvedBy) throw new Error("Missing approving operator.");
  const membership = await getWanderMembership(send.approvedBy);
  if (!canOperateEmailDelivery(membership?.role))
    return { status: "access_revoked" };
  if (Date.parse(input.dueAt) > Date.now()) {
    const queued = await queueSend(send.id, input.dueAt, input.runtimeId);
    return { status: queued.authoritative ? "queued" : "inactive" };
  }
  try {
    await dispatchBrandSend({
      messageSendId: send.id,
      organizationId: membership.organizationId,
      userId: send.approvedBy,
      scheduledJob: input,
    });
  } catch (error) {
    // Preflight failures have not claimed a run. Keep them recoverable and visible.
    await db
      .update(messageSendTable)
      .set({
        error:
          error instanceof Error ? error.message : "Scheduled delivery failed",
      })
      .where(
        and(
          eq(messageSendTable.id, send.id),
          eq(messageSendTable.status, "approved"),
        ),
      );
    throw error;
  }
  return { status: "sent" };
}
