import "server-only";

import { and, desc, eq, isNotNull, sql } from "drizzle-orm";

import { env } from "@/env";
import { db } from "@/server/db";
import {
  leadContactTable,
  leadDomainTable,
  leadSequenceTable,
  pregenBuildTable,
} from "@/server/db/leads-schema";
import {
  HS_OWNER_NAMES,
  HS_SLACK_IDS,
  HUBSPOT_ACCOUNT_ID,
} from "@/server/clients/hubspot.client";
import { escapeSlackMrkdwn, postOnSlack } from "@/server/clients/slack.client";
import { assignPregenOpen } from "./open-rotation.service";

/**
 * A prospect opened their wander.com/os pitch page: stamp the view on the
 * build row and ping the owning rep in #radio-core-inbound, so a call can land
 * while they are browsing.
 *
 * Counting and alerting follow different rules on purpose. Every view
 * increments the counters (funnel data); alerts fire on the first view and
 * then at most once per cooldown, which is the dial to turn when sales says
 * it is too chatty.
 */

/** Same channel the inbound lead router posts to. */
const RADIO_CORE_INBOUND_CHANNEL_ID = "C0A3PMXE3MG";
const SLACK_TESTING_CHANNEL = "radio-slack-testing";

const ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

function mentionForOwnerId(ownerId: string | null): string | null {
  if (!ownerId) return null;
  const slackId = HS_SLACK_IDS[ownerId];
  if (slackId) return `<@${slackId}>`;
  const name = HS_OWNER_NAMES[ownerId];
  return name ? escapeSlackMrkdwn(name) : null;
}

/** `lead_domain.hubspotOwner` stores a display name, so mentioning walks
    name → owner id → Slack id. Unmapped owners post as plain text and
    Kristian adds the id to HS_SLACK_IDS when it matters. */
function mentionForOwnerName(ownerName: string | null): string {
  if (!ownerName) return "unassigned";
  const ownerId = Object.entries(HS_OWNER_NAMES).find(
    ([, name]) => name === ownerName,
  )?.[0];
  return mentionForOwnerId(ownerId ?? null) ?? escapeSlackMrkdwn(ownerName);
}

export type PregenViewResult =
  | { recorded: false; reason: string }
  | { recorded: true; viewCount: number; alerted: boolean };

export async function recordPregenPreviewView(input: {
  websiteId: string;
  /** From a non-production caller; routes the ping to the testing channel. */
  test?: boolean;
}): Promise<PregenViewResult> {
  const [build] = await db
    .select()
    .from(pregenBuildTable)
    .where(
      and(
        eq(pregenBuildTable.websiteId, input.websiteId),
        isNotNull(pregenBuildTable.previewUrl),
      ),
    )
    .orderBy(desc(pregenBuildTable.requestedAt))
    .limit(1);
  // Unknown ids are expected traffic: the /os page renders for any slug, and
  // growth only knows builds it requested.
  if (!build) return { recorded: false, reason: "unknown websiteId" };

  const now = new Date();
  const cooldownFloor = new Date(now.getTime() - ALERT_COOLDOWN_MS);

  // The alert slot is claimed in the same UPDATE that counts the view, so two
  // concurrent beacons cannot both pass a read-then-write check and double-post.
  const [updated] = await db
    .update(pregenBuildTable)
    .set({
      viewCount: sql`${pregenBuildTable.viewCount} + 1`,
      firstViewedAt: sql`coalesce(${pregenBuildTable.firstViewedAt}, ${now})`,
      lastViewedAt: now,
      lastAlertedAt: sql`case when ${pregenBuildTable.lastAlertedAt} is null or ${pregenBuildTable.lastAlertedAt} < ${cooldownFloor} then ${now} else ${pregenBuildTable.lastAlertedAt} end`,
    })
    .where(eq(pregenBuildTable.id, build.id))
    .returning({
      viewCount: pregenBuildTable.viewCount,
      lastAlertedAt: pregenBuildTable.lastAlertedAt,
    });

  const viewCount = updated?.viewCount ?? build.viewCount + 1;
  const claimedAlert = updated?.lastAlertedAt?.getTime() === now.getTime();
  if (!claimedAlert) return { recorded: true, viewCount, alerted: false };

  const [domain] = await db
    .select()
    .from(leadDomainTable)
    .where(eq(leadDomainTable.id, build.domainId))
    .limit(1);

  // Who the email actually went to, when a sequence has been sent.
  const [recipient] = await db
    .select({
      email: leadContactTable.email,
      hubspotContactId: leadContactTable.hubspotContactId,
    })
    .from(leadSequenceTable)
    .innerJoin(
      leadContactTable,
      eq(leadContactTable.id, leadSequenceTable.contactId),
    )
    .where(
      and(
        eq(leadSequenceTable.domainId, build.domainId),
        eq(leadSequenceTable.status, "sent"),
      ),
    )
    .orderBy(desc(leadSequenceTable.sentAt))
    .limit(1);

  // Routed here rather than up front: the open is the qualifying event, and
  // reassigning a book of cold companies before anyone reacts moves ownership
  // on no signal at all. See `open-rotation.service.ts`.
  const assigned = await assignPregenOpen(build.id);

  const company = escapeSlackMrkdwn(
    domain?.companyName ?? build.businessName ?? build.domain,
  );
  const isFirst = build.firstViewedAt == null;

  const about = [
    `Up: ${(assigned && mentionForOwnerId(assigned.ownerId)) ?? "unassigned"}`,
    `CRM owner: ${mentionForOwnerName(domain?.hubspotOwner ?? null)}`,
    domain?.unitCount ?? domain?.unitEstimate
      ? `${domain.unitCount ?? domain.unitEstimate} homes`
      : null,
    domain?.pms ? escapeSlackMrkdwn(domain.pms) : null,
    [domain?.city, domain?.state].filter(Boolean).length
      ? escapeSlackMrkdwn([domain?.city, domain?.state].filter(Boolean).join(", "))
      : null,
    `views: ${viewCount}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const links = [
    `their site: https://${build.domain}`,
    build.previewUrl ? `<${build.previewUrl}|pregen site>` : null,
    recipient
      ? recipient.hubspotContactId
        ? `sent to <https://app.hubspot.com/contacts/${HUBSPOT_ACCOUNT_ID}/record/0-1/${recipient.hubspotContactId}|${escapeSlackMrkdwn(recipient.email)}>`
        : `sent to ${escapeSlackMrkdwn(recipient.email)}`
      : null,
    `<${env.NEXT_PUBLIC_BASE_URL}/app/leads/${build.domain}|lead page>`,
    domain?.hubspotRecordId
      ? `<https://app.hubspot.com/contacts/${HUBSPOT_ACCOUNT_ID}/record/0-2/${domain.hubspotRecordId}|HubSpot>`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const result = await postOnSlack({
    channel: input.test
      ? SLACK_TESTING_CHANNEL
      : RADIO_CORE_INBOUND_CHANNEL_ID,
    text: `👀 ${company} is looking at their pregen site right now${isFirst ? " (first view)" : ""}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text:
            `👀 *${company}* is on their pregen site *right now*${isFirst ? " — *first view*" : ""}\n` +
            `${about}\n${links}`,
        },
      },
    ],
    // Every message carries the same links; unfurl cards would drown the channel.
    unfurl_links: false,
    unfurl_media: false,
  });

  // Release the claimed slot on a failed post, so a Slack hiccup costs a
  // retry-on-next-view instead of a silent 6h gap.
  if (!result.success) {
    await db
      .update(pregenBuildTable)
      .set({ lastAlertedAt: build.lastAlertedAt })
      .where(
        and(
          eq(pregenBuildTable.id, build.id),
          eq(pregenBuildTable.lastAlertedAt, now),
        ),
      );
  }

  return { recorded: true, viewCount, alerted: result.success };
}
