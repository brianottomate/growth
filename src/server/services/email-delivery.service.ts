import "server-only";

import { and, eq } from "drizzle-orm";

import {
  assertCustomerIoDeliveryTarget,
  assertProductUpdateReadyForDelivery,
  customerIoBroadcastData,
  messageSendSummary,
  type MessageAudienceKind,
  type MessageSendSnapshot,
} from "@/lib/email-delivery";
import {
  getCustomerIoCampaign,
  getCustomerIoSegment,
  triggerBroadcast,
} from "@/server/clients/customerio.client";
import { db } from "@/server/db";
import {
  emailDocumentTable,
  emailDocumentVersionTable,
  messageSendTable,
  platformPostTable,
} from "@/server/db/schema";
import { renderDesignSystemNewsletter } from "@/server/email/design-system-newsletter-renderer";
import {
  ensureEmailDocument,
  requireOwnedEmailSpot,
} from "@/server/services/email-document.service";

function providerMessageId(response: Record<string, unknown>) {
  for (const key of ["id", "delivery_id", "broadcast_delivery_id"]) {
    const value = response[key];
    if (typeof value === "string" || typeof value === "number") {
      return String(value);
    }
  }
  return null;
}

async function requireOwnedMessageSend(
  messageSendId: string,
  organizationId: string,
) {
  const send = await db.query.messageSendTable.findFirst({
    where: eq(messageSendTable.id, messageSendId),
  });
  if (!send) throw new Error("Message send not found.");
  await requireOwnedEmailSpot(send.platformPostId, organizationId);
  return send;
}

export async function createMessageSendDraft(input: {
  platformPostId: string;
  organizationId: string;
  userId: string;
  providerBroadcastId: number;
  audienceKind: MessageAudienceKind;
  segmentId: number;
}) {
  const { document, spot } = await ensureEmailDocument(input);
  if (document.currentRevision < 1) {
    throw new Error("Save at least one revision before preparing a send.");
  }

  const version = await db.query.emailDocumentVersionTable.findFirst({
    where: and(
      eq(emailDocumentVersionTable.emailDocumentId, document.id),
      eq(emailDocumentVersionTable.revision, document.currentRevision),
    ),
  });
  if (!version) throw new Error("The current email revision is unavailable.");

  assertProductUpdateReadyForDelivery({
    productUpdate: version.snapshot.productUpdate,
    audienceKind: input.audienceKind,
  });

  const [providerBroadcast, providerSegment] = await Promise.all([
    getCustomerIoCampaign(input.providerBroadcastId),
    getCustomerIoSegment(input.segmentId),
  ]);
  assertCustomerIoDeliveryTarget({
    productUpdate: version.snapshot.productUpdate,
    broadcast: providerBroadcast,
    segment: providerSegment,
  });
  if (!providerSegment) {
    throw new Error("Customer.io segment validation failed.");
  }

  const rendered = await renderDesignSystemNewsletter({
    document: version.snapshot,
    brandName: spot.brand.name,
    logo: spot.brand.brandIdentity?.logo ?? spot.brand.logo,
  });
  const snapshot: MessageSendSnapshot = {
    schema: "wander-growth.message-send.v1",
    format: spot.format as MessageSendSnapshot["format"],
    revision: version.revision,
    email: {
      subject: version.snapshot.subject,
      preheader: version.snapshot.preheader,
      bodyMarkdown: version.snapshot.bodyMarkdown,
      bodyHtml: rendered.bodyHtml,
      ctaLabel: version.snapshot.ctaLabel,
      ctaUrl: version.snapshot.ctaUrl,
      templateKey: version.snapshot.templateKey,
    },
    audience: {
      kind: input.audienceKind,
      provider: "customerio",
      segmentId: input.segmentId,
      label: providerSegment.name,
    },
    productUpdate: version.snapshot.productUpdate ?? null,
    preview: {
      renderer: "@wandercom/design-system-emails",
      template: "generic.html",
      html: rendered.html,
      text: rendered.text,
    },
  };
  const idempotencyKey = [
    spot.id,
    version.revision,
    "customerio",
    input.providerBroadcastId,
    input.segmentId,
  ].join(":");

  const existing = await db.query.messageSendTable.findFirst({
    where: eq(messageSendTable.idempotencyKey, idempotencyKey),
  });
  if (existing) {
    if (["approved", "sending", "sent"].includes(existing.status)) {
      return messageSendSummary(existing);
    }
    const [refreshed] = await db
      .update(messageSendTable)
      .set({
        audienceKind: input.audienceKind,
        audienceLabel: providerSegment.name,
        snapshot,
        status: "draft",
        error: null,
        failedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(messageSendTable.id, existing.id))
      .returning();
    return messageSendSummary(refreshed!);
  }

  const [created] = await db
    .insert(messageSendTable)
    .values({
      platformPostId: spot.id,
      emailDocumentId: document.id,
      emailDocumentVersionId: version.id,
      revision: version.revision,
      provider: "customerio",
      providerBroadcastId: String(input.providerBroadcastId),
      audienceKind: input.audienceKind,
      audienceReference: String(input.segmentId),
      audienceLabel: providerSegment.name,
      snapshot,
      idempotencyKey,
      createdBy: input.userId,
    })
    .returning();
  if (!created) throw new Error("Could not prepare the message send.");
  return messageSendSummary(created);
}

export async function approveMessageSend(input: {
  messageSendId: string;
  organizationId: string;
  userId: string;
}) {
  const send = await requireOwnedMessageSend(
    input.messageSendId,
    input.organizationId,
  );
  if (!["draft", "failed"].includes(send.status)) {
    throw new Error(`A ${send.status} send cannot be approved.`);
  }
  const document = await db.query.emailDocumentTable.findFirst({
    where: eq(emailDocumentTable.id, send.emailDocumentId),
  });
  if (document?.currentRevision !== send.revision) {
    throw new Error(
      "The email changed after this send was prepared. Prepare a new send from the latest revision.",
    );
  }
  const [approved] = await db
    .update(messageSendTable)
    .set({
      status: "approved",
      approvedBy: input.userId,
      approvedAt: new Date(),
      error: null,
      failedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(messageSendTable.id, send.id))
    .returning();
  return messageSendSummary(approved!);
}

export async function sendApprovedMessage(input: {
  messageSendId: string;
  organizationId: string;
  userId: string;
}) {
  const send = await requireOwnedMessageSend(
    input.messageSendId,
    input.organizationId,
  );
  const document = await db.query.emailDocumentTable.findFirst({
    where: eq(emailDocumentTable.id, send.emailDocumentId),
  });
  if (document?.currentRevision !== send.revision) {
    throw new Error(
      "The approved revision is no longer current. Prepare and approve a new send.",
    );
  }

  const [claimed] = await db
    .update(messageSendTable)
    .set({ status: "sending", sentBy: input.userId, updatedAt: new Date() })
    .where(
      and(
        eq(messageSendTable.id, send.id),
        eq(messageSendTable.status, "approved"),
      ),
    )
    .returning();
  if (!claimed) {
    throw new Error("This message is not approved or is already being sent.");
  }

  const broadcastId = Number(claimed.providerBroadcastId);
  const segmentId = Number(claimed.audienceReference);
  let response: Record<string, unknown>;
  try {
    response = await triggerBroadcast(
      broadcastId,
      customerIoBroadcastData(claimed.id, claimed.snapshot),
      { segment: { id: segmentId } },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Customer.io broadcast failed";
    await db
      .update(messageSendTable)
      .set({
        status: "failed",
        error: message,
        failedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(messageSendTable.id, claimed.id));
    throw error;
  }

  // The provider has accepted the broadcast. From this point onward, leave the
  // row in `sending` if persistence fails so a retry cannot duplicate a real
  // customer send; reconciliation can safely complete the ledger later.
  const now = new Date();
  const [completed] = await db
    .update(messageSendTable)
    .set({
      status: "sent",
      providerMessageId: providerMessageId(response),
      sentAt: now,
      error: null,
      updatedAt: now,
    })
    .where(eq(messageSendTable.id, claimed.id))
    .returning();
  await db
    .update(platformPostTable)
    .set({ status: "published", publishedAt: now })
    .where(eq(platformPostTable.id, claimed.platformPostId));
  return messageSendSummary(completed!);
}
