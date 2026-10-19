import "server-only";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { env } from "@/env";
import { db, withTransaction } from "@/server/db";
import { messageSendTable, platformPostTable } from "@/server/db/schema";
import { emailDocumentDraftSchema } from "@/lib/email-document";
import { brandSendBlockers } from "@/lib/email-delivery";
import {
  broadcastJobCanRun,
  type BroadcastScheduleInput,
} from "@/lib/broadcast-schedule";
import {
  ensureEmailDocument,
  requireOwnedEmailSpot,
} from "./email-document.service";
import { getEmailAudienceSnapshot } from "./email-audience.service";
import { dispatchBrandSend } from "./brand-email-send.service";
import { getWanderMembership } from "@/server/wander-workspace";
import {
  lifecycleReadiness,
  publishEmailJob,
  requireLifecycleRuntime,
} from "./lifecycle-runtime/providers";

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
    const snapshot = await getEmailAudienceSnapshot(
      { snapshotId: audience.snapshotId },
      actor,
    );
    if (
      snapshot.status !== "ready" ||
      !snapshot.definition.consentConfirmed ||
      Date.parse(dueAt) >= new Date(snapshot.expiresAt).getTime()
    )
      throw new Error(
        "The approved audience must be ready, consented and valid through the send date. Compile a fresh snapshot if needed.",
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
      recipientCount: snapshot.recipientCount ?? 0,
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
      sends,
    }),
    readiness: lifecycleReadiness(),
  };
}

async function queueSend(
  messageSendId: string,
  dueAt: string,
  runtimeId: string,
) {
  const receipt = await publishEmailJob({
    path: "/api/jobs/email-broadcast",
    key: `broadcast-${messageSendId}-${Date.parse(dueAt)}`,
    body: { messageSendId, dueAt, runtimeId },
    dueAt: new Date(dueAt),
  });
  // Scheduled is a queue receipt, not an approval or a calendar date.
  const send = await db.query.messageSendTable.findFirst({
    where: eq(messageSendTable.id, messageSendId),
  });
  if (!send) return receipt;
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
    if (
      current?.status !== "approved" ||
      !current.snapshot.schedule ||
      !broadcastJobCanRun(current.snapshot.schedule, { dueAt, runtimeId }) ||
      !post ||
      !["approved", "scheduled"].includes(post.status)
    )
      return;
    await tx
      .update(messageSendTable)
      .set({
        snapshot: {
          ...current.snapshot,
          schedule: {
            ...current.snapshot.schedule,
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
  });
  return receipt;
}

export async function scheduleBroadcasts(
  input: BroadcastScheduleInput & {
    reviewedHash: string;
    customerIoStopped: true;
  },
  actor: Actor,
) {
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
      await queueSend(item.messageSendId, item.scheduledAt, runtimeId);
      results.push({ messageSendId: item.messageSendId, queued: true });
    } catch {
      results.push({ messageSendId: item.messageSendId, queued: false });
    }
  }
  return { sends: results };
}

export async function pauseBroadcast(messageSendId: string, actor: Actor) {
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
    if (
      !current?.snapshot.schedule ||
      !["approved", "sending"].includes(current.status)
    )
      throw new Error("No active schedule to pause.");
    await tx
      .update(messageSendTable)
      .set({
        snapshot: {
          ...current.snapshot,
          schedule: { ...current.snapshot.schedule, state: "paused" },
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
  const { send } = await ownedSend(messageSendId, actor);
  const schedule = send.snapshot.schedule;
  if (
    send.status !== "approved" ||
    !schedule ||
    !["approved", "scheduled"].includes(schedule.state) ||
    schedule.runtimeId !== env.LIFECYCLE_RUNTIME_ID
  )
    throw new Error(
      "Only an unstarted active schedule can be recovered. Investigate attempted sends separately.",
    );
  await queueSend(send.id, schedule.dueAt, schedule.runtimeId);
  return { queued: true };
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
  if (!membership) return { status: "access_revoked" };
  if (Date.parse(input.dueAt) > Date.now()) {
    await queueSend(send.id, input.dueAt, input.runtimeId);
    return { status: "queued" };
  }
  await dispatchBrandSend({
    messageSendId: send.id,
    organizationId: membership.organizationId,
    userId: send.approvedBy,
    scheduledJob: input,
  });
  return { status: "sent" };
}
