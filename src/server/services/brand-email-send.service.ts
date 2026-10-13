import "server-only";
import { createHash } from "node:crypto";

import { and, eq, inArray, lt, ne, or } from "drizzle-orm";

import { emailDocumentDraftSchema } from "@/lib/email-document";
import {
  filterEmailAudienceBatch,
  type EmailAudienceRecipient,
} from "@/lib/email-audience";
import {
  brandSendBlockers,
  messageSendSummary,
  type MessageSendSnapshot,
} from "@/lib/email-delivery";
import { fillFields } from "@/lib/email-personalization";
import { websiteEmailOptOuts } from "./email-opt-outs.service";
import {
  postmarkServerToken,
  sendPostmarkBatch,
  type PostmarkOutgoingMessage,
} from "@/server/clients/postmark.client";
import { db, withTransaction } from "@/server/db";
import {
  emailAudienceSnapshotTable,
  emailAudienceTable,
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
  getEmailAudienceSnapshot,
  readEmailAudienceBatch,
} from "@/server/services/email-audience.service";

// Brand marketing email through the brand's own provider (Postmark today). The
// steps are the same ones every send takes: prepare (freeze the rendered email
// and the audience), approve (a person signs off), send (on demand, by an
// owner or admin). Sending rechecks everything that can change after approval.

const UNSUBSCRIBE = "{{{ pm:unsubscribe }}}";
const PAGE_SIZE = 500;
/** A `sending` row untouched this long belongs to a run that died. */
const STALE_LEASE_MS = 15 * 60_000;

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
    unsubscribeUrl: UNSUBSCRIBE,
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
  const [result] = await sendPostmarkBatch(token, [
    {
      From: fromHeader(sender),
      To: user.email,
      ...(sender.replyTo ? { ReplyTo: sender.replyTo } : {}),
      Subject: `[Test] ${current.subject}`,
      HtmlBody: rendered.html,
      TextBody: rendered.text,
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
 * Freeze the current email and a compiled audience into a draft send. A
 * changed email or a new snapshot makes a new draft; the approval belongs to
 * exactly what was prepared.
 */
export async function prepareBrandSend(
  input: { platformPostId: string; snapshotId: string } & Actor,
) {
  const spot = await requireOwnedEmailSpot(
    input.platformPostId,
    input.organizationId,
  );
  const blockers = brandSendBlockers(spot.brand);
  // Published: an earlier wave of this email went out; the next one may follow.
  if (!["approved", "published"].includes(spot.status))
    throw new Error("Approve the email creative before preparing delivery.");
  if (blockers.length) throw new Error(blockers.join(" "));
  const snapshot = await getEmailAudienceSnapshot(
    { snapshotId: input.snapshotId },
    input,
  );
  const audience = await db.query.emailAudienceTable.findFirst({
    where: eq(emailAudienceTable.id, snapshot.audienceId),
  });
  if (audience?.brandId !== spot.brandId)
    throw new Error("That audience belongs to another brand.");
  if (snapshot.status !== "ready")
    throw new Error("Compile the audience before preparing a send.");
  if (!snapshot.definition.consentConfirmed)
    throw new Error("Confirm this audience's marketing permission first.");

  const { document } = await ensureEmailDocument(input);
  const { current, hash } = contentHashOf(document);
  if (!current.subject.trim() || !current.bodyMarkdown.trim())
    throw new Error("Save an email before preparing a send.");
  const rendered = await renderForBrand(spot, current);
  const delivery = spot.brand.emailDelivery!;
  const label = `${audience.name} (${snapshot.recipientCount ?? 0} guests)`;
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
      snapshotId: snapshot.id,
      serverId: delivery.serverId,
      messageStream: delivery.messageStream,
      label,
    },
    sender: senderOf(spot),
    productUpdate: null,
    preview: {
      renderer: "@wandercom/design-system-emails",
      template: "generic.html",
      html: rendered.html,
      text: rendered.text,
    },
  };
  const idempotencyKey = [
    spot.id,
    hash,
    "postmark",
    delivery.serverId,
    snapshot.id,
  ].join(":");
  const existing = await db.query.messageSendTable.findFirst({
    where: eq(messageSendTable.idempotencyKey, idempotencyKey),
  });
  if (existing) return messageSendSummary(existing);
  const [created] = await db
    .insert(messageSendTable)
    .values({
      platformPostId: spot.id,
      documentId: document.id,
      contentHash: hash,
      provider: "postmark",
      providerBroadcastId: String(delivery.serverId),
      audienceKind: "guests",
      audienceReference: snapshot.id,
      audienceLabel: label,
      snapshot: snapshotRecord,
      idempotencyKey,
      createdBy: input.userId,
    })
    .returning();
  if (!created) throw new Error("Could not prepare the send.");
  return messageSendSummary(created);
}

/** Every link in the email must open before a guest sees it. */
async function brokenLinks(html: string) {
  const links = [
    ...new Set(
      [...html.matchAll(/href="([^"]+)"/g)]
        .map((match) => match[1]!.replace(/&amp;/g, "&"))
        .filter((href) => /^https?:\/\//.test(href)),
    ),
  ];
  const broken: string[] = [];
  for (let index = 0; index < links.length; index += 6) {
    await Promise.all(
      links.slice(index, index + 6).map(async (href) => {
        try {
          const response = await fetch(href, {
            redirect: "follow",
            signal: AbortSignal.timeout(15_000),
            headers: { "user-agent": "WanderGrowthLinkCheck/1.0" },
          });
          if (response.status >= 400)
            broken.push(`${href} (${response.status})`);
        } catch {
          broken.push(`${href} (no response)`);
        }
      }),
    );
  }
  return broken;
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

/**
 * Send an approved Postmark send, or resume one that failed part way (approve
 * it again) or whose run died in `sending`. The per-guest ledger means a
 * resumed send only reaches guests it has not already claimed.
 * Before the first guest: the email must still be the approved revision and
 * every link must open. Per page of guests: WanderOS opt-outs are dropped
 * (uploaded lists have none; the brand's Postmark stream holds their
 * unsubscribes), so is anyone an earlier send of this email already reached,
 * each address is written to the ledger before Postmark is called, and
 * Postmark's own suppressions come back as skipped rather than failed.
 */
export async function dispatchBrandSend(input: {
  messageSendId: string;
  organizationId: string;
  userId?: string;
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
  if (!["approved", "published"].includes(spot.status))
    throw new Error(
      "Approve the email creative before sending. Reopened drafts cannot be sent.",
    );
  if (snapshot.audience.provider !== "postmark" || !snapshot.sender)
    throw new Error("This send has no Postmark audience.");
  const audience = snapshot.audience;

  const staleBefore = new Date(Date.now() - STALE_LEASE_MS);
  const claimed = await withTransaction(async (tx) => {
    const [current] = await tx
      .select({ status: platformPostTable.status })
      .from(platformPostTable)
      .where(eq(platformPostTable.id, spot.id))
      .for("update");
    if (!current || !["approved", "published"].includes(current.status))
      throw new Error("Approve the email creative before sending.");
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
          or(
            eq(messageSendTable.status, "approved"),
            and(
              eq(messageSendTable.status, "sending"),
              lt(messageSendTable.updatedAt, staleBefore),
            ),
          ),
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
    if (!claimed.dispatchCursor) {
      const { document } = await ensureEmailDocument({
        platformPostId: spot.id,
        ...actor,
      });
      if (contentHashOf(document).hash !== claimed.contentHash)
        throw new Error(
          "The email changed after it was approved. Prepare and approve it again.",
        );
      const broken = await brokenLinks(snapshot.preview.html);
      if (broken.length) throw new Error(`Broken links: ${broken.join(", ")}`);
    }

    const source = (
      await getEmailAudienceSnapshot({ snapshotId: audience.snapshotId }, actor)
    ).definition.source;
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

    const sendPage = async (recipients: EmailAudienceRecipient[]) => {
      const emails = [
        ...new Set(
          recipients.map((recipient) => recipient.email.trim().toLowerCase()),
        ),
      ];
      // Waves of one email (100, then 1,000, then everyone) overlap by design.
      const reached = new Set(
        emails.length
          ? (
              await db
                .select({ email: messageSendRecipientTable.email })
                .from(messageSendRecipientTable)
                .innerJoin(
                  messageSendTable,
                  eq(
                    messageSendTable.id,
                    messageSendRecipientTable.messageSendId,
                  ),
                )
                .where(
                  and(
                    eq(messageSendTable.platformPostId, spot.id),
                    ne(messageSendTable.id, claimed.id),
                    inArray(messageSendRecipientTable.status, [
                      "pending",
                      "sent",
                    ]),
                    inArray(messageSendRecipientTable.email, emails),
                  ),
                )
            ).map((row) => row.email)
          : [],
      );
      const eligible = await filterEmailAudienceBatch(
        recipients,
        async (batch) =>
          new Map(
            batch.map((email) => [
              email,
              !optedOut.has(email) && !reached.has(email),
            ]),
          ),
      );
      const skipped = emails.flatMap((email) =>
        optedOut.has(email)
          ? [{ email, reason: "opted_out" }]
          : reached.has(email)
            ? [{ email, reason: "already_sent" }]
            : [],
      );
      if (skipped.length)
        await db
          .insert(messageSendRecipientTable)
          .values(
            skipped.map((row) => ({
              messageSendId: claimed.id,
              ...row,
              status: "skipped" as const,
            })),
          )
          .onConflictDoNothing();

      // Only addresses this send has never claimed go out.
      const fresh = eligible.length
        ? await db
            .insert(messageSendRecipientTable)
            .values(
              eligible.map((recipient) => ({
                messageSendId: claimed.id,
                email: recipient.email,
              })),
            )
            .onConflictDoNothing()
            .returning({
              id: messageSendRecipientTable.id,
              email: messageSendRecipientTable.email,
            })
        : [];
      const byEmail = new Map<string, EmailAudienceRecipient>(
        eligible.map((recipient) => [recipient.email, recipient]),
      );
      const messages: PostmarkOutgoingMessage[] = fresh.map((row) => {
        const guest = byEmail.get(row.email)!;
        const fields = { email: guest.email, first_name: guest.first_name };
        return {
          From: fromHeader(sender),
          To: guest.email,
          ...(sender.replyTo ? { ReplyTo: sender.replyTo } : {}),
          Subject: fillFields(snapshot.email.subject, fields, { html: false }),
          HtmlBody: fillFields(snapshot.preview.html, fields, { html: true }),
          TextBody: fillFields(snapshot.preview.text, fields, { html: false }),
          MessageStream: audience.messageStream,
          Tag: spot.id,
          TrackOpens: true,
          TrackLinks: "HtmlAndText",
          Metadata: { message_send_id: claimed.id, platform_post_id: spot.id },
        };
      });
      const results = await sendPostmarkBatch(token, messages);
      await Promise.all(
        fresh.map((row, index) => {
          const result = results[index];
          const ok = result?.ErrorCode === 0;
          // 406: Postmark suppressed the address (bounce, complaint, unsubscribe).
          const status = ok
            ? ("sent" as const)
            : result?.ErrorCode === 406
              ? ("skipped" as const)
              : ("failed" as const);
          return db
            .update(messageSendRecipientTable)
            .set({
              status,
              providerMessageId: result?.MessageID ?? null,
              reason: ok
                ? null
                : (result?.Message ?? "No result from Postmark"),
              sentAt: ok ? new Date() : null,
            })
            .where(eq(messageSendRecipientTable.id, row.id));
        }),
      );
    };

    // "done" means a run sent the last page and died before marking it sent.
    let cursor: string | null =
      claimed.dispatchCursor === "done" ? null : claimed.dispatchCursor;
    let more = claimed.dispatchCursor !== "done";
    while (more) {
      const page = await readEmailAudienceBatch(
        {
          snapshotId: audience.snapshotId,
          pageSize: PAGE_SIZE,
          ...(cursor ? { pageToken: cursor } : {}),
        },
        actor,
      );
      await sendPage(page.recipients);
      cursor = page.nextPageToken;
      more = cursor !== null;
      await db
        .update(messageSendTable)
        .set({ dispatchCursor: cursor ?? "done", updatedAt: new Date() })
        .where(eq(messageSendTable.id, claimed.id));
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

/** Ready snapshots of the brand's audiences, newest first, for the picker. */
export async function brandSendAudiences(
  input: { brandId: string } & Pick<Actor, "organizationId">,
) {
  const audiences = await db.query.emailAudienceTable.findMany({
    where: eq(emailAudienceTable.brandId, input.brandId),
  });
  if (!audiences.length) return [];
  const snapshots = await db.query.emailAudienceSnapshotTable.findMany({
    where: and(
      inArray(
        emailAudienceSnapshotTable.audienceId,
        audiences.map((audience) => audience.id),
      ),
      eq(emailAudienceSnapshotTable.status, "ready"),
    ),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
    limit: 20,
  });
  const names = new Map(
    audiences.map((audience) => [audience.id, audience.name]),
  );
  return snapshots
    .filter((snapshot) => snapshot.expiresAt > new Date())
    .map((snapshot) => ({
      id: snapshot.id,
      name: names.get(snapshot.audienceId) ?? "Audience",
      recipientCount: snapshot.recipientCount,
      consentConfirmed: Boolean(snapshot.definition.consentConfirmed),
      createdAt: snapshot.createdAt,
    }));
}
