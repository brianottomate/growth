import "server-only";

import { and, eq } from "drizzle-orm";

import { env } from "@/env";
import {
  AMPLIFICATION_ACTIONS,
  buildAmplificationSlackMessage,
  type AmplificationAction,
} from "@/lib/amplification-slack";
import { postOnSlack } from "@/server/clients/slack.client";
import { db } from "@/server/db";
import { amplificationTargetTable } from "@/server/db/schema";

export async function notifyAmplificationTarget(input: {
  targetId: string;
  organizationId: string;
}) {
  const target = await db.query.amplificationTargetTable.findFirst({
    where: eq(amplificationTargetTable.id, input.targetId),
    with: {
      amplifier: true,
      platformPost: {
        with: { brand: true, contentPost: { columns: { title: true } } },
      },
    },
  });
  if (target?.amplifier.organizationId !== input.organizationId) {
    throw new Error("Amplification target not found");
  }
  if (target.slackStatus === "sent" && target.slackMessageTs) {
    return {
      status: "already_sent" as const,
      channel: target.slackChannel,
      messageTs: target.slackMessageTs,
    };
  }
  if (!env.SLACK_AMPLIFICATION_CHANNEL_ID) {
    throw new Error("SLACK_AMPLIFICATION_CHANNEL_ID is not configured");
  }
  if (
    !AMPLIFICATION_ACTIONS.includes(target.actionKind as AmplificationAction)
  ) {
    throw new Error(`Unsupported amplification action: ${target.actionKind}`);
  }
  const coordinatorUserId = env.SLACK_AMPLIFICATION_COORDINATOR_USER_ID;
  const recipientUserId = coordinatorUserId ?? target.amplifier.slackUserId;
  if (!recipientUserId) {
    throw new Error(
      "No amplification coordinator or amplifier Slack member ID is configured",
    );
  }

  const message = buildAmplificationSlackMessage({
    slackUserId: recipientUserId,
    recipientRole: coordinatorUserId ? "coordinator" : "amplifier",
    amplifierName: target.amplifier.name,
    actionKind: target.actionKind as AmplificationAction,
    brandName: target.platformPost.brand?.name ?? "Wander",
    platform: target.platformPost.platform,
    title: target.platformPost.contentPost?.title,
    draftText: target.draftText,
    notes: target.notes,
    plannedAt: target.plannedAt,
    sourceUrl: target.platformPost.externalUrl,
    workUrl: target.platformPost.contentPostId
      ? `${env.NEXT_PUBLIC_BASE_URL}/app/content/${target.platformPost.contentPostId}`
      : `${env.NEXT_PUBLIC_BASE_URL}/app/content`,
  });
  const sent = await postOnSlack({
    channel: env.SLACK_AMPLIFICATION_CHANNEL_ID,
    text: message.text,
    unfurl_links: false,
    unfurl_media: false,
  });

  if (!sent.success || !sent.ts) {
    const error = sent.success
      ? "Slack returned no message timestamp"
      : sent.error;
    await db
      .update(amplificationTargetTable)
      .set({ slackStatus: "failed", slackError: error })
      .where(
        and(
          eq(amplificationTargetTable.id, target.id),
          eq(amplificationTargetTable.amplifierId, target.amplifierId),
        ),
      );
    throw new Error(`Slack notification failed: ${error}`);
  }

  const notifiedAt = new Date();
  await db
    .update(amplificationTargetTable)
    .set({
      ask: "asked",
      slackStatus: "sent",
      slackChannel: sent.channel,
      slackMessageTs: sent.ts,
      slackError: null,
      slackNotifiedAt: notifiedAt,
    })
    .where(eq(amplificationTargetTable.id, target.id));

  return {
    status: "sent" as const,
    channel: sent.channel,
    messageTs: sent.ts,
    notifiedAt,
  };
}
