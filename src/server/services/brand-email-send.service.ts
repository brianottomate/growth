import "server-only";
import { createHash } from "node:crypto";
import { toPlainText } from "@react-email/render";
import {
  tagBookingLinks,
  RECIPIENT_KEY_PLACEHOLDER,
} from "@/server/email/booking-attribution";
import {
  emailRecipientKey,
  emailRecipientMetadata,
} from "@/server/email/recipient-identity";
import { createId } from "@/server/db/utils";
import { broadcastJobCanRun } from "@/lib/broadcast-schedule";

import { and, eq, inArray, sql } from "drizzle-orm";

import { emailDocumentDraftSchema } from "@/lib/email-document";
import { type EmailAudienceRecipient } from "@/lib/email-audience";
import {
  brandSendBlockers,
  messageSendSummary,
  type MessageSendSnapshot,
  type EmailDeliveryReceipt,
} from "@/lib/email-delivery";
import {
  compilePostmarkTemplate,
  UNSUBSCRIBE_PLACEHOLDER,
} from "@/lib/email-personalization";
import {
  brandOptOuts,
  growthHandlesUnsubscribes,
  personalUnsubscribe,
  withUnsubscribeUrl,
} from "@/server/email/unsubscribe";
import { websiteEmailOptOuts } from "./email-opt-outs.service";
import {
  postmarkServerToken,
  sendPostmarkBatch,
  sendPostmarkBulk,
} from "@/server/clients/postmark.client";
import { db, withTransaction } from "@/server/db";
import {
  messageSendRecipientTable,
  messageSendTable,
  platformPostTable,
  userTable,
} from "@/server/db/schema";
import { renderDesignSystemNewsletter } from "@/server/email/newsletter-renderer-core";
import {
  ensureEmailDocument,
  requireOwnedEmailSpot,
} from "@/server/services/email-document.service";
import {
  getEmailAudience,
  listEmailAudiences,
  readEmailAudienceRecipients,
} from "@/server/services/email-audience.service";

// Brand marketing email through the brand's own provider (Postmark today). The
// steps are the same ones every send takes: prepare (freeze the rendered email
// and the audience), approve (a person signs off), send (on demand, by an
// owner or admin). Sending rechecks everything that can change after approval.

/** Bound SQL parameters for custom-stream opt-out lookups. */
const OPT_OUT_READ_SIZE = 10_000;

type Actor = { organizationId: string; userId: string };

function contentHashOf(document: unknown) {
  const current = emailDocumentDraftSchema.parse(document);
  return {
    current,
    hash: createHash("sha256").update(JSON.stringify(current)).digest("hex"),
  };
}

function fromHeader(sender: { fromName: string; fromEmail: string }) {
  const name = sender.fromName.replace(/["\\]/g, "");
  return `"${name}" <${sender.fromEmail}>`;
}

async function renderForBrand(
  spot: Awaited<ReturnType<typeof requireOwnedEmailSpot>>,
  document: ReturnType<typeof emailDocumentDraftSchema.parse>,
  recipient?: { email: string; first_name?: string | null },
) {
  return renderDesignSystemNewsletter({
    document,
    brandName: spot.brand.name,
    logo: spot.brand.brandIdentity?.logo ?? spot.brand.logo,
    sender: spot.brand.emailSender,
    legal: spot.brand.legalIdentity,
    unsubscribeUrl: UNSUBSCRIBE_PLACEHOLDER,
    recipient,
  });
}

function senderOf(spot: Awaited<ReturnType<typeof requireOwnedEmailSpot>>) {
  const sender = spot.brand.emailSender;
  if (!sender?.fromEmail) throw new Error("The brand has no from-address.");
  return {
    fromName: sender.fromName || spot.brand.name,
    fromEmail: sender.fromEmail,
    replyTo: sender.replyTo ?? null,
  };
}

/**
 * The current saved email, to the signed-in person only, through the brand's
 * own server and stream. Nothing is recorded as a send.
 */
export async function sendBrandTestEmail(
  input: { platformPostId: string } & Actor,
) {
  const spot = await requireOwnedEmailSpot(
    input.platformPostId,
    input.organizationId,
  );
  const blockers = brandSendBlockers(spot.brand);
  if (blockers.length) throw new Error(blockers.join(" "));
  const user = await db.query.userTable.findFirst({
    where: eq(userTable.id, input.userId),
  });
  if (!user?.email) throw new Error("Your account has no email address.");
  const { document } = await ensureEmailDocument(input);
  const { current } = contentHashOf(document);
  if (!current.subject.trim() || !current.bodyMarkdown.trim())
    throw new Error("Save an email before sending a test.");
  const rendered = await renderForBrand(spot, current, {
    email: user.email,
    first_name: user.name?.split(" ")[0] || null,
  });
  const sender = senderOf(spot);
  const delivery = spot.brand.emailDelivery!;
  const token = await postmarkServerToken(delivery.serverId);
  // A real link where Growth handles unsubscribes: following it unsubscribes
  // the tester from this brand.
  const own = (await growthHandlesUnsubscribes(token, delivery.messageStream))
    ? personalUnsubscribe(spot.brandId, user.email)
    : null;
  const [result] = await sendPostmarkBatch(token, [
    {
      From: fromHeader(sender),
      To: user.email,
      ...(sender.replyTo ? { ReplyTo: sender.replyTo } : {}),
      Subject: `[Test] ${current.subject}`,
      HtmlBody: own
        ? withUnsubscribeUrl(rendered.html, own.url)
        : rendered.html,
      TextBody: own
        ? withUnsubscribeUrl(rendered.text, own.url)
        : rendered.text,
      ...(own ? { Headers: own.headers } : {}),
      MessageStream: delivery.messageStream,
      Tag: "growth-test",
      TrackOpens: true,
      TrackLinks: "HtmlAndText",
      Metadata: { platform_post_id: spot.id, test: "true" },
    },
  ]);
  if (result?.ErrorCode !== 0)
    throw new Error(`Postmark refused the test: ${result?.Message}`);
  return { to: user.email, messageId: result.MessageID ?? null };
}

/**
 * Freeze the current creative and reference a live audience in a draft send.
 */
export async function prepareBrandSend(
  input: { platformPostId: string; audienceId: string } & Actor,
) {
  const spot = await requireOwnedEmailSpot(
    input.platformPostId,
    input.organizationId,
  );
  const blockers = brandSendBlockers(spot.brand);
  // Scheduling and previous publication do not revoke creative approval.
  if (!["approved", "scheduled", "published"].includes(spot.status))
    throw new Error("Approve the email creative before preparing delivery.");
  if (blockers.length) throw new Error(blockers.join(" "));
  const audience = await getEmailAudience(
    { audienceId: input.audienceId },
    input,
  );
  if (audience.brandId !== spot.brandId)
    throw new Error("That audience belongs to another brand.");
  if (!audience.definition.consentConfirmed)
    throw new Error("Confirm this audience's marketing permission first.");

  const { document } = await ensureEmailDocument(input);
  const { current, hash } = contentHashOf(document);
  if (!current.subject.trim() || !current.bodyMarkdown.trim())
    throw new Error("Save an email before preparing a send.");
  const delivery = spot.brand.emailDelivery!;
  const idempotencyKey = [
    "email-recipient-attribution-v2",
    spot.id,
    hash,
    "postmark",
    delivery.serverId,
    audience.id,
  ].join(":");
  const existing = await db.query.messageSendTable.findFirst({
    where: eq(messageSendTable.idempotencyKey, idempotencyKey),
  });
  if (existing) return messageSendSummary(existing);
  const sendId = createId("msg");
  const siteUrl = spot.brand.emailSender?.siteUrl ?? spot.brand.website;
  if (!siteUrl)
    throw new Error(
      "Set the brand's website URL before preparing a tracked email.",
    );
  const rendered = await renderForBrand(spot, current);
  const html = tagBookingLinks(rendered.html, {
    siteUrl,
    sendId,
    campaign: spot.id,
  });
  const label = audience.name;
  const snapshotRecord: MessageSendSnapshot = {
    schema: "wander-growth.message-send.v1",
    format: spot.format as MessageSendSnapshot["format"],
    contentHash: hash,
    email: {
      subject: current.subject,
      preheader: current.preheader ?? null,
      bodyMarkdown: current.bodyMarkdown,
      bodyHtml: rendered.bodyHtml,
      ctaLabel: current.ctaLabel ?? null,
      ctaUrl: current.ctaUrl ?? null,
      templateKey: current.templateKey,
    },
    audience: {
      kind: "guests",
      provider: "postmark",
      audienceId: audience.id,
      serverId: delivery.serverId,
      messageStream: delivery.messageStream,
      label,
    },
    sender: senderOf(spot),
    productUpdate: null,
    preview: {
      renderer: "@wandercom/design-system-emails",
      template: "generic.html",
      html,
      text: toPlainText(html),
    },
  };
  const [created] = await db
    .insert(messageSendTable)
    .values({
      id: sendId,
      platformPostId: spot.id,
      documentId: document.id,
      contentHash: hash,
      provider: "postmark",
      providerBroadcastId: String(delivery.serverId),
      audienceKind: "guests",
      audienceReference: audience.id,
      audienceLabel: label,
      snapshot: snapshotRecord,
      idempotencyKey,
      createdBy: input.userId,
    })
    .returning();
  if (!created) throw new Error("Could not prepare the send.");
  return messageSendSummary(created);
}

/**
 * Postmark templates refuse <link> stylesheets. The renderer's only one is
 * the web font, so it moves into an @import, which the same mail apps load.
 */
export function bulkSafeHtml(html: string) {
  return html.replace(
    /<link\b[^>]*href="([^"]+)"[^>]*rel="stylesheet"[^>]*\/?>/g,
    (_tag, href: string) =>
      `<style>@import url("${href.replace(/&amp;/g, "&")}");</style>`,
  );
}

async function failSend(id: string, message: string) {
  await db
    .update(messageSendTable)
    .set({
      status: "failed",
      error: message,
      failedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(messageSendTable.id, id));
}

/** Submit an approved broadcast once. Postmark owns processing after acceptance. */
export async function dispatchBrandSend(input: {
  messageSendId: string;
  organizationId: string;
  userId?: string;
  scheduledJob?: { dueAt: string; runtimeId: string };
}) {
  const send = await db.query.messageSendTable.findFirst({
    where: eq(messageSendTable.id, input.messageSendId),
  });
  if (send?.provider !== "postmark")
    throw new Error("Postmark send not found.");
  const spot = await requireOwnedEmailSpot(
    send.platformPostId,
    input.organizationId,
  );
  const snapshot = send.snapshot;
  if (
    snapshot.schedule &&
    (!input.scheduledJob ||
      !broadcastJobCanRun(snapshot.schedule, input.scheduledJob) ||
      Date.parse(snapshot.schedule.dueAt) > Date.now())
  )
    throw new Error("This email is controlled by its saved delivery schedule.");
  if (!["approved", "scheduled", "published"].includes(spot.status))
    throw new Error(
      "Approve the email creative before sending. Reopened drafts cannot be sent.",
    );
  if (snapshot.audience.provider !== "postmark" || !snapshot.sender)
    throw new Error("This send has no Postmark audience.");
  const audience = snapshot.audience;
  if (
    snapshot.schedule &&
    (brandSendBlockers(spot.brand).length ||
      JSON.stringify(senderOf(spot)) !== JSON.stringify(snapshot.sender) ||
      spot.brand.emailDelivery?.serverId !== audience.serverId ||
      spot.brand.emailDelivery?.messageStream !== audience.messageStream)
  )
    throw new Error(
      "The approved sender or Postmark destination changed. Review delivery again.",
    );

  const claimed = await withTransaction(async (tx) => {
    const [current] = await tx
      .select({ status: platformPostTable.status })
      .from(platformPostTable)
      .where(eq(platformPostTable.id, spot.id))
      .for("update");
    if (
      !current ||
      !["approved", "scheduled", "published"].includes(current.status)
    )
      throw new Error("Approve the email creative before sending.");
    if (snapshot.schedule) {
      const [scheduled] = await tx
        .select()
        .from(messageSendTable)
        .where(eq(messageSendTable.id, send.id))
        .for("update");
      if (
        !input.scheduledJob ||
        !broadcastJobCanRun(scheduled?.snapshot.schedule, input.scheduledJob)
      )
        throw new Error("The delivery schedule changed or paused.");
    }
    const [row] = await tx
      .update(messageSendTable)
      .set({
        status: "sending",
        sentBy: input.userId ?? send.approvedBy,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(messageSendTable.id, send.id),
          eq(messageSendTable.status, "approved"),
        ),
      )
      .returning();
    return row;
  });
  if (!claimed)
    throw new Error("This send is not approved or is already being sent.");
  const actor = {
    organizationId: input.organizationId,
    userId: input.userId ?? claimed.approvedBy ?? claimed.createdBy ?? "",
  };

  try {
    {
      const { document } = await ensureEmailDocument({
        platformPostId: spot.id,
        ...actor,
      });
      if (contentHashOf(document).hash !== claimed.contentHash)
        throw new Error(
          "The email changed after it was approved. Prepare and approve it again.",
        );
    }

    const currentAudience = await getEmailAudience(
      { audienceId: audience.audienceId },
      actor,
    );
    if (
      currentAudience.brandId !== spot.brandId ||
      !currentAudience.definition.consentConfirmed
    )
      throw new Error(
        "The audience must belong to this brand and have marketing permission.",
      );
    const source = currentAudience.definition.source;
    let optedOut = new Set<string>();
    if (source !== "list") {
      const websiteId = spot.brand.wanderOsWebsiteId;
      if (!websiteId)
        throw new Error(
          "The brand has no WanderOS website to read opt-outs from.",
        );
      optedOut = await websiteEmailOptOuts(websiteId);
    }
    const token = await postmarkServerToken(audience.serverId);
    const sender = snapshot.sender;
    const ownUnsubscribe = await growthHandlesUnsubscribes(
      token,
      audience.messageStream,
    );
    const compiled = compilePostmarkTemplate({
      subject: snapshot.email.subject,
      html: bulkSafeHtml(snapshot.preview.html),
      text: snapshot.preview.text,
    });
    // Postmark fills its placeholder on a Postmark-managed stream; otherwise
    // each guest's own link goes in through the template model.
    const unsubscribeKey = (content: string) =>
      ownUnsubscribe
        ? content.replaceAll(UNSUBSCRIBE_PLACEHOLDER, "{{{unsubscribe_url}}}")
        : content;
    const template = {
      ...compiled,
      html: unsubscribeKey(compiled.html).replaceAll(
        RECIPIENT_KEY_PLACEHOLDER,
        "{{{growth_recipient_key}}}",
      ),
      text: unsubscribeKey(compiled.text).replaceAll(
        RECIPIENT_KEY_PLACEHOLDER,
        "{{{growth_recipient_key}}}",
      ),
    };

    const recipients = await readEmailAudienceRecipients(
      { audienceId: audience.audienceId },
      actor,
    );

    if (snapshot.schedule) {
      const currentSend = await db.query.messageSendTable.findFirst({
        where: eq(messageSendTable.id, claimed.id),
      });
      const currentSpot = await requireOwnedEmailSpot(
        spot.id,
        input.organizationId,
      );
      const { document } = await ensureEmailDocument({
        platformPostId: spot.id,
        ...actor,
      });
      if (
        !input.scheduledJob ||
        !broadcastJobCanRun(
          currentSend?.snapshot.schedule,
          input.scheduledJob,
        ) ||
        !["approved", "scheduled", "published"].includes(currentSpot.status) ||
        contentHashOf(document).hash !== claimed.contentHash
      )
        throw new Error(
          "Scheduled delivery paused or creative changed; review before sending.",
        );
    }
    const emails = recipients.map((recipient) => recipient.email);
    // Postmark-managed streams own suppressions; Custom streams use Growth preferences.
    const unsubscribed = new Set<string>();
    if (ownUnsubscribe) {
      for (
        let offset = 0;
        offset < emails.length;
        offset += OPT_OUT_READ_SIZE
      ) {
        const optedOutEmails = await brandOptOuts(
          spot.brandId,
          emails.slice(offset, offset + OPT_OUT_READ_SIZE),
        );
        for (const email of optedOutEmails) unsubscribed.add(email);
      }
    }
    const isOptedOut = (email: string) =>
      optedOut.has(email) || unsubscribed.has(email);
    const eligible = recipients.filter(
      (recipient) => !isOptedOut(recipient.email),
    );
    const skipped = emails
      .filter(isOptedOut)
      .map((email) => ({ email, reason: "opted_out" }));
    for (let offset = 0; offset < skipped.length; offset += 1000)
      await db
        .insert(messageSendRecipientTable)
        .values(
          skipped.slice(offset, offset + 1000).map((row) => ({
            messageSendId: claimed.id,
            ...row,
            status: "skipped" as const,
          })),
        )
        .onConflictDoNothing();

    // These rows support booking attribution and webhook identity, not send retries.
    const recipientRows: Array<{ id: string; email: string }> = [];
    for (let offset = 0; offset < eligible.length; offset += 1000) {
      const rows = await db
        .insert(messageSendRecipientTable)
        .values(
          eligible.slice(offset, offset + 1000).map((recipient) => ({
            messageSendId: claimed.id,
            email: recipient.email,
          })),
        )
        .onConflictDoUpdate({
          target: [
            messageSendRecipientTable.messageSendId,
            messageSendRecipientTable.email,
          ],
          set: {
            status: "pending",
            reason: null,
            sentAt: null,
            providerMessageId: null,
          },
        })
        .returning({
          id: messageSendRecipientTable.id,
          email: messageSendRecipientTable.email,
        });
      recipientRows.push(...rows);
    }
    const byEmail = new Map<string, EmailAudienceRecipient>(
      eligible.map((recipient) => [recipient.email, recipient]),
    );
    if (!recipientRows.length)
      throw new Error("The audience has no eligible recipients.");
    const recipientTemplate = (email: string, key: string) => {
      const model = {
        ...template.modelFor(byEmail.get(email)!),
        growth_recipient_key: key,
      };
      if (!ownUnsubscribe) return { TemplateModel: model };
      const own = personalUnsubscribe(spot.brandId, email);
      return {
        TemplateModel: { ...model, unsubscribe_url: own.url },
        Headers: own.headers,
      };
    };
    // One request for the entire broadcast; Postmark owns pacing and suppressions.
    const bulk = await sendPostmarkBulk(token, {
      From: fromHeader(sender),
      ...(sender.replyTo ? { ReplyTo: sender.replyTo } : {}),
      Subject: template.subject,
      HtmlBody: template.html,
      TextBody: template.text,
      MessageStream: audience.messageStream,
      Tag: spot.id,
      TrackOpens: true,
      TrackLinks: "HtmlAndText",
      Messages: recipientRows.map((row) => {
        const key = emailRecipientKey(spot.brandId, row.email);
        return {
          To: row.email,
          ...recipientTemplate(row.email, key),
          Metadata: emailRecipientMetadata({
            sendId: claimed.id,
            postId: spot.id,
            recipientId: row.id,
            key,
          }),
        };
      }),
    });

    const receipt: EmailDeliveryReceipt = {
      provider: "postmark",
      messageSendId: claimed.id,
      audienceReference: audience.audienceId,
      bulkRequest: {
        id: bulk.Id,
        submittedAt: bulk.SubmittedAt,
        recipientCount: bulk.TotalMessages,
      },
    };
    // A receipt of the accepted request, not another scheduling or delivery status.
    await db
      .update(platformPostTable)
      .set({
        metadata: sql`coalesce(${platformPostTable.metadata}, '{}'::jsonb) || ${JSON.stringify({ emailDelivery: receipt })}::jsonb`,
      })
      .where(eq(platformPostTable.id, spot.id));
    // "sent" means handed to Postmark in this bulk request; delivery,
    // bounces and suppressions arrive through its webhooks.
    for (let offset = 0; offset < recipientRows.length; offset += 1000) {
      await db
        .update(messageSendRecipientTable)
        .set({
          status: "sent",
          providerMessageId: `bulk:${bulk.Id}`,
          sentAt: new Date(),
        })
        .where(
          inArray(
            messageSendRecipientTable.id,
            recipientRows.slice(offset, offset + 1000).map((row) => row.id),
          ),
        );
    }

    const now = new Date();
    const [completed] = await db
      .update(messageSendTable)
      .set({ status: "sent", sentAt: now, error: null, updatedAt: now })
      .where(eq(messageSendTable.id, claimed.id))
      .returning();
    await db
      .update(platformPostTable)
      .set({ status: "published", publishedAt: now })
      .where(eq(platformPostTable.id, spot.id));
    return messageSendSummary(completed!);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Send failed";
    await failSend(claimed.id, message);
    throw error;
  }
}

/** How a Postmark send went, from its ledger. */
export async function brandSendProgress(
  input: { messageSendId: string } & Pick<Actor, "organizationId">,
) {
  const send = await db.query.messageSendTable.findFirst({
    where: eq(messageSendTable.id, input.messageSendId),
  });
  if (!send) throw new Error("Send not found.");
  await requireOwnedEmailSpot(send.platformPostId, input.organizationId);
  const rows = await db
    .select({ status: messageSendRecipientTable.status })
    .from(messageSendRecipientTable)
    .where(eq(messageSendRecipientTable.messageSendId, send.id));
  const counts = { pending: 0, sent: 0, skipped: 0, failed: 0 };
  for (const row of rows) counts[row.status] += 1;
  return counts;
}

/** Current audiences for the brand's send picker. */
export async function brandSendAudiences(
  input: { brandId: string } & Pick<Actor, "organizationId">,
) {
  const audiences = await listEmailAudiences({ brandId: input.brandId }, input);
  return audiences.map((audience) => ({
    id: audience.id,
    name: audience.name,
    recipientCount: audience.recipientCount,
    consentConfirmed: audience.definition.consentConfirmed,
    createdAt: new Date(audience.createdAt),
  }));
}
