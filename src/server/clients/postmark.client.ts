import "server-only";

import { env } from "@/env";

// Postmark client. Postmark has two auth scopes: the account token (servers,
// domains, sender signatures) and a per-server token (streams, stats,
// messages, suppressions, webhooks, sending). Every server's token is on its
// GET /servers row, so the account token reaches any server. Writes: the sends,
// which brand-email-send.service calls once a person has approved the send,
// and the server/stream/webhook setup a brand gets when it becomes a client.

const API_BASE = "https://api.postmarkapp.com";

type Scope = { account: true } | { serverToken?: string };

function postmarkGet<T>(
  path: string,
  scope: Scope,
  query?: Record<string, string | number | undefined>,
): Promise<T> {
  return postmarkRequest<T>("GET", path, scope, { query });
}

function postmarkPost<T>(path: string, scope: Scope, body: object) {
  return postmarkRequest<T>("POST", path, scope, { body });
}

async function postmarkRequest<T>(
  method: "GET" | "POST",
  path: string,
  scope: Scope,
  options: {
    query?: Record<string, string | number | undefined>;
    body?: object;
  },
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body) headers["Content-Type"] = "application/json";
  if ("account" in scope) {
    if (!env.POSTMARK_ACCOUNT_TOKEN) {
      throw new Error("POSTMARK_ACCOUNT_TOKEN is not set.");
    }
    headers["X-Postmark-Account-Token"] = env.POSTMARK_ACCOUNT_TOKEN;
  } else {
    const token = scope.serverToken ?? env.POSTMARK_SERVER_TOKEN;
    if (!token) throw new Error("POSTMARK_SERVER_TOKEN is not set.");
    headers["X-Postmark-Server-Token"] = token;
  }

  const url = new URL(path, API_BASE);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Postmark ${method} ${path} → ${response.status}: ${body}`);
  }
  return (await response.json()) as T;
}

export type PostmarkServer = {
  ID: number;
  Name: string;
  ApiTokens: string[];
  Color: string;
  SmtpApiActivated: boolean;
  RawEmailEnabled: boolean;
  DeliveryType: "Live" | "Sandbox";
  ServerLink: string;
  InboundAddress: string;
  TrackOpens: boolean;
  TrackLinks: "None" | "HtmlAndText" | "HtmlOnly" | "TextOnly";
  EnableSmtpApiErrorHooks: boolean;
};

export type PostmarkDomainSummary = {
  ID: number;
  Name: string;
  SPFVerified: boolean;
  DKIMVerified: boolean;
  WeakDKIM: boolean;
  ReturnPathDomainVerified: boolean;
};

export type PostmarkDomain = PostmarkDomainSummary & {
  SPFHost: string;
  SPFTextValue: string;
  DKIMHost: string;
  DKIMTextValue: string;
  DKIMPendingHost: string;
  DKIMPendingTextValue: string;
  DKIMRevokedHost: string;
  DKIMRevokedTextValue: string;
  SafeToRemoveRevokedKeyFromDNS: boolean;
  /** Live signal; `DKIMVerified` latches true forever once set. */
  DKIMUpdateStatus: "Pending" | "Verified";
  ReturnPathDomain: string;
  ReturnPathDomainCNAMEValue: string;
};

export type PostmarkSenderSignature = {
  ID: number;
  Domain: string;
  EmailAddress: string;
  Name: string;
  ReplyToEmailAddress: string;
  Confirmed: boolean;
};

export type PostmarkMessageStream = {
  ID: string;
  ServerID: number;
  Name: string;
  Description: string | null;
  MessageStreamType: "Transactional" | "Broadcasts" | "Inbound";
  CreatedAt: string;
  UpdatedAt: string | null;
  ArchivedAt: string | null;
  SubscriptionManagementConfiguration: {
    UnsubscribeHandlingType: "None" | "Postmark" | "Custom";
  };
};

export type PostmarkSuppression = {
  EmailAddress: string;
  SuppressionReason: "HardBounce" | "SpamComplaint" | "ManualSuppression";
  Origin: "Recipient" | "Customer" | "Admin";
  CreatedAt: string;
};

export type PostmarkOutboundMessage = {
  MessageID: string;
  MessageStream: string;
  From: string;
  Recipients: string[];
  Subject: string;
  Tag: string;
  Status: string;
  ReceivedAt: string;
  Metadata: Record<string, string>;
};

export type PostmarkWebhook = {
  ID: number;
  Url: string;
  MessageStream: string;
  Triggers: Record<string, { Enabled: boolean }>;
};

// ---- account scope -------------------------------------------------

export function listPostmarkServers(count = 500, offset = 0) {
  return postmarkGet<{ TotalCount: number; Servers: PostmarkServer[] }>(
    "/servers",
    { account: true },
    { count, offset },
  );
}

export function getPostmarkServerById(serverId: number) {
  return postmarkGet<PostmarkServer>(`/servers/${serverId}`, { account: true });
}

export function createPostmarkServer(name: string) {
  return postmarkPost<PostmarkServer>(
    "/servers",
    { account: true },
    { Name: name, TrackOpens: true, TrackLinks: "HtmlAndText" },
  );
}

/** A brand server's send token, read with the account token when needed. */
export async function postmarkServerToken(serverId: number) {
  const server = await getPostmarkServerById(serverId);
  const token = server.ApiTokens[0];
  if (!token) throw new Error(`Postmark server ${serverId} has no API token.`);
  return token;
}

export function listPostmarkDomains(count = 500, offset = 0) {
  return postmarkGet<{ TotalCount: number; Domains: PostmarkDomainSummary[] }>(
    "/domains",
    { account: true },
    { count, offset },
  );
}

export async function listAllPostmarkDomains() {
  const all: PostmarkDomainSummary[] = [];
  for (let offset = 0; ; offset += 500) {
    const page = await listPostmarkDomains(500, offset);
    all.push(...page.Domains);
    if (page.Domains.length === 0 || all.length >= page.TotalCount) return all;
  }
}

export function getPostmarkDomain(domainId: number) {
  return postmarkGet<PostmarkDomain>(`/domains/${domainId}`, {
    account: true,
  });
}

export async function findPostmarkDomain(name: string) {
  const wanted = name.toLowerCase();
  const match = (await listAllPostmarkDomains()).find(
    (domain) => domain.Name.toLowerCase() === wanted,
  );
  return match ? getPostmarkDomain(match.ID) : null;
}

export function listPostmarkSenderSignatures(count = 500, offset = 0) {
  return postmarkGet<{
    TotalCount: number;
    SenderSignatures: PostmarkSenderSignature[];
  }>("/senders", { account: true }, { count, offset });
}

// ---- server scope (defaults to POSTMARK_SERVER_TOKEN) ---------------

export function getPostmarkServer(serverToken?: string) {
  return postmarkGet<PostmarkServer>("/server", { serverToken });
}

export function listPostmarkMessageStreams(serverToken?: string) {
  return postmarkGet<{ MessageStreams: PostmarkMessageStream[] }>(
    "/message-streams",
    { serverToken },
    { IncludeArchivedStreams: "false" },
  );
}

export function getPostmarkOutboundStats(
  query: { fromdate?: string; todate?: string; messagestream?: string } = {},
  serverToken?: string,
) {
  return postmarkGet<Record<string, number>>(
    "/stats/outbound",
    { serverToken },
    query,
  );
}

export function getPostmarkDeliveryStats(serverToken?: string) {
  return postmarkGet<{
    InactiveMails: number;
    Bounces: { Name: string; Count: number; Type?: string }[];
  }>("/deliverystats", { serverToken });
}

export function dumpPostmarkSuppressions(
  streamId: string,
  query: { SuppressionReason?: string; EmailAddress?: string } = {},
  serverToken?: string,
) {
  return postmarkGet<{ Suppressions: PostmarkSuppression[] }>(
    `/message-streams/${streamId}/suppressions/dump`,
    { serverToken },
    query,
  );
}

export function searchPostmarkOutboundMessages(
  query: {
    count?: number;
    offset?: number;
    recipient?: string;
    fromemail?: string;
    tag?: string;
    status?: string;
    messagestream?: string;
    fromdate?: string;
    todate?: string;
  } = {},
  serverToken?: string,
) {
  return postmarkGet<{
    TotalCount: number;
    Messages: PostmarkOutboundMessage[];
  }>("/messages/outbound", { serverToken }, { count: 50, offset: 0, ...query });
}

export function listPostmarkWebhooks(serverToken?: string) {
  return postmarkGet<{ Webhooks: PostmarkWebhook[] }>("/webhooks", {
    serverToken,
  });
}

/** A broadcast stream whose unsubscribes Postmark handles and suppresses. */
export function createPostmarkBroadcastStream(
  serverToken: string,
  stream: { id: string; name: string },
) {
  return postmarkPost<PostmarkMessageStream>(
    "/message-streams",
    { serverToken },
    {
      ID: stream.id,
      Name: stream.name,
      MessageStreamType: "Broadcasts",
      SubscriptionManagementConfiguration: {
        UnsubscribeHandlingType: "Postmark",
      },
    },
  );
}

export function createPostmarkWebhook(
  serverToken: string,
  webhook: {
    url: string;
    messageStream: string;
    headers: { Name: string; Value: string }[];
  },
) {
  const on = { Enabled: true };
  return postmarkPost<PostmarkWebhook>(
    "/webhooks",
    { serverToken },
    {
      Url: webhook.url,
      MessageStream: webhook.messageStream,
      HttpHeaders: webhook.headers,
      Triggers: {
        Open: { ...on, PostFirstOpenOnly: false },
        Click: on,
        Delivery: on,
        Bounce: { ...on, IncludeContent: false },
        SpamComplaint: { ...on, IncludeContent: false },
        SubscriptionChange: on,
      },
    },
  );
}

export function listPostmarkBulkRequests(serverToken?: string) {
  return postmarkGet<unknown>("/email/bulk", { serverToken });
}

// ---- sending --------------------------------------------------------

export type PostmarkOutgoingMessage = {
  From: string;
  To: string;
  ReplyTo?: string;
  Subject: string;
  HtmlBody: string;
  TextBody: string;
  MessageStream: string;
  Tag?: string;
  TrackOpens?: boolean;
  TrackLinks?: "None" | "HtmlAndText" | "HtmlOnly" | "TextOnly";
  Metadata?: Record<string, string>;
  Headers?: { Name: string; Value: string }[];
};

export type PostmarkSendResult = {
  ErrorCode: number;
  Message: string;
  MessageID?: string;
  To?: string;
};

export type PostmarkBulkRequest = {
  From: string;
  ReplyTo?: string;
  /** Subject and bodies are one Mustachio template for every recipient. */
  Subject: string;
  HtmlBody: string;
  TextBody: string;
  MessageStream: string;
  Tag?: string;
  TrackOpens?: boolean;
  TrackLinks?: PostmarkOutgoingMessage["TrackLinks"];
  Messages: {
    To: string;
    TemplateModel?: Record<string, string | null>;
    Metadata?: Record<string, string>;
    Headers?: { Name: string; Value: string }[];
  }[];
};

export type PostmarkBulkStatus = {
  Id: string;
  SubmittedAt: string;
  Status: "Accepted" | "Processing" | "Completed" | "Cancelled";
  TotalMessages: number;
  PercentageCompleted: number;
  ReleasedCount: number;
  FailedCount: number;
};

/**
 * One broadcast to many recipients; Postmark paces the release itself. The
 * request is all or nothing: one malformed address rejects it (422), while
 * suppressed recipients are accepted and land in FailedCount. Broadcast
 * streams only.
 */
export async function sendPostmarkBulk(
  serverToken: string,
  request: PostmarkBulkRequest,
) {
  const body = JSON.stringify(request);
  if (Buffer.byteLength(body, "utf8") > 50_000_000) {
    throw new Error(
      "The broadcast exceeds Postmark's 50 MB payload limit. Reduce the audience or email size before sending.",
    );
  }
  const response = await fetch(new URL("/email/bulk", API_BASE), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": serverToken,
    },
    body,
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Postmark POST /email/bulk → ${response.status}: ${body}`);
  }
  return (await response.json()) as PostmarkBulkStatus;
}

/** A server's message stream, including who handles its unsubscribes. */
export function getPostmarkMessageStream(
  serverToken: string,
  streamId: string,
) {
  return postmarkGet<{
    ID: string;
    MessageStreamType: string;
    SubscriptionManagementConfiguration?: {
      UnsubscribeHandlingType?: "None" | "Postmark" | "Custom";
    };
  }>(`/message-streams/${streamId}`, { serverToken });
}

export function getPostmarkBulkStatus(serverToken: string, bulkId: string) {
  return postmarkGet<PostmarkBulkStatus>(`/email/bulk/${bulkId}`, {
    serverToken,
  });
}

/**
 * Up to 500 messages in one call. Postmark answers with one result per
 * message, in order; a suppressed or inactive recipient comes back with a
 * non-zero ErrorCode rather than failing the batch.
 */
export async function sendPostmarkBatch(
  serverToken: string,
  messages: PostmarkOutgoingMessage[],
) {
  if (messages.length === 0) return [];
  if (messages.length > 500)
    throw new Error("Postmark batches are limited to 500 messages.");
  const response = await fetch(new URL("/email/batch", API_BASE), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": serverToken,
    },
    body: JSON.stringify(messages),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Postmark POST /email/batch → ${response.status}: ${body}`);
  }
  return (await response.json()) as PostmarkSendResult[];
}
