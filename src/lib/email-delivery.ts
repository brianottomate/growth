import type { ProductUpdateContext } from "@/lib/email-document";

export const MESSAGE_AUDIENCE_KINDS = [
  "wanderos_operators",
  "guests",
  "subscribers",
] as const;

export type MessageAudienceKind = (typeof MESSAGE_AUDIENCE_KINDS)[number];

export const MESSAGE_SEND_STATUSES = [
  "draft",
  "approved",
  "sending",
  "sent",
  "failed",
  "cancelled",
] as const;

export type MessageSendStatus = (typeof MESSAGE_SEND_STATUSES)[number];

export type MessageSendSummary = {
  id: string;
  contentHash: string;
  provider: "customerio";
  providerBroadcastId: string;
  providerMessageId: string | null;
  audienceKind: MessageAudienceKind;
  audienceReference: string;
  audienceLabel: string;
  status: MessageSendStatus;
  error: string | null;
  approvedAt: Date | null;
  sentAt: Date | null;
  createdAt: Date;
};

/**
 * Keep provider payloads and the immutable rendered snapshot on the server.
 * The editor only needs this small delivery receipt to drive its controls.
 */
export function messageSendSummary(
  send: MessageSendSummary,
): MessageSendSummary {
  return {
    id: send.id,
    contentHash: send.contentHash,
    provider: send.provider,
    providerBroadcastId: send.providerBroadcastId,
    providerMessageId: send.providerMessageId,
    audienceKind: send.audienceKind,
    audienceReference: send.audienceReference,
    audienceLabel: send.audienceLabel,
    status: send.status,
    error: send.error,
    approvedAt: send.approvedAt,
    sentAt: send.sentAt,
    createdAt: send.createdAt,
  };
}

export type MessageSendSnapshot = {
  schema: "wander-growth.message-send.v1";
  format: "newsletter.broadcast" | "newsletter.blast";
  contentHash: string;
  email: {
    subject: string;
    preheader: string | null;
    bodyMarkdown: string;
    bodyHtml: string;
    ctaLabel: string | null;
    ctaUrl: string | null;
    templateKey: string;
  };
  audience: {
    kind: MessageAudienceKind;
    provider: "customerio";
    segmentId: number;
    label: string;
  };
  productUpdate: ProductUpdateContext | null;
  preview: {
    renderer: "@wandercom/design-system-emails";
    template: "generic.html";
    html: string;
    text: string;
  };
};

/**
 * Product-update broadcasts are operator communications and may only leave the
 * planning stage once every supporting change is verified on a release path.
 */
export function assertProductUpdateReadyForDelivery(input: {
  productUpdate?: ProductUpdateContext | null;
  audienceKind: MessageAudienceKind;
}) {
  if (!input.productUpdate) return;
  if (input.audienceKind !== "wanderos_operators") {
    throw new Error(
      "WanderOS product updates can only target the operator audience.",
    );
  }
  const pending = input.productUpdate.changes.filter(
    (change) => change.releaseStatus !== "shipped",
  );
  if (pending.length) {
    throw new Error(
      `Verify these changes as shipped before preparing delivery: ${pending
        .map((change) => `${change.repository}@${change.ref}`)
        .join(", ")}`,
    );
  }
}

export function assertCustomerIoDeliveryTarget(input: {
  productUpdate?: ProductUpdateContext | null;
  broadcast: { type: string; state: string; active: boolean } | null;
  segment: { type: string; state: string } | null;
}) {
  if (
    input.broadcast?.type !== "api" ||
    input.broadcast.state !== "running" ||
    !input.broadcast.active
  ) {
    throw new Error(
      "Choose an active Customer.io API-triggered broadcast before preparing delivery.",
    );
  }
  if (input.segment?.state !== "finished") {
    throw new Error(
      "Choose an available Customer.io segment before preparing delivery.",
    );
  }
  if (input.productUpdate && input.segment.type !== "dynamic") {
    throw new Error(
      "WanderOS product updates require a dynamic Customer.io segment so live operator membership is evaluated at send time.",
    );
  }
}

/**
 * Data made available to the configured Customer.io broadcast's Liquid
 * template. Customer.io remains responsible for recipients, suppressions,
 * consent, and the unsubscribe footer; no contact list is copied into Growth.
 */
export function customerIoBroadcastData(
  messageSendId: string,
  snapshot: MessageSendSnapshot,
) {
  return {
    schema: "wander-growth.customerio-broadcast.v1" as const,
    messageSendId,
    growth: {
      format: snapshot.format,
      content_hash: snapshot.contentHash,
      audienceKind: snapshot.audience.kind,
      email: snapshot.email,
    },
  };
}
