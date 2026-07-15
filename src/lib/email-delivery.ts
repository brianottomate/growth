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
  revision: number;
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
    revision: send.revision,
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
  revision: number;
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
  preview: {
    renderer: "@wandercom/design-system-emails";
    template: "generic.html";
    html: string;
    text: string;
  };
};

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
      revision: snapshot.revision,
      audienceKind: snapshot.audience.kind,
      email: snapshot.email,
    },
  };
}
