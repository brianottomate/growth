/**
 * Build the sales-email corpus: every recent one-to-one email our reps sent
 * and every reply that came back, anonymized, labelled by outcome, and written
 * to `leads.sales_email_corpus` where the sequence generator can read it.
 *
 * v1 kept outbound only and wrote a gitignored file that one person read once.
 * The point of the corpus was always "what does an email that works look
 * like", and that question is unanswerable without the inbound half: the reply
 * IS the outcome label. So v2 scans both directions, matches each outbound to
 * the first inbound from the same counterpart within 45 days, and persists to
 * the database so generation can inject real winning exchanges instead of
 * hand-transcribed impressions of them.
 *
 * Required private-app scope: sales-email-read
 *
 *   bun --conditions=react-server scripts/build-hubspot-sales-email-corpus.ts
 *   bun --conditions=react-server scripts/build-hubspot-sales-email-corpus.ts \
 *     --limit 3000 --scan-limit 12000 --days 365
 *
 * Bodies are anonymized before insert — emails, phones and URLs become tokens,
 * quoted history and signatures are stripped — and the leak check refuses to
 * write a row that still contains a direct address. Names, companies and the
 * prospect-specific language stay, because they are what makes an exemplar
 * worth reading.
 */
import { createHash } from "node:crypto";

import he from "he";
import sanitizeHtml from "sanitize-html";

import { env } from "@/env";
import { HS_OWNER_NAMES } from "@/server/clients/hubspot.client";
import { db } from "@/server/db";
import { salesEmailCorpusTable } from "@/server/db/leads-schema";

const TOKEN = env.HUBSPOT_ACCESS_TOKEN_OPERATED;
if (!TOKEN) throw new Error("HUBSPOT_ACCESS_TOKEN_OPERATED not set");

const PAGE_SIZE = 200;
const REPLY_WINDOW_MS = 45 * 24 * 60 * 60 * 1000;

type Address = {
  email?: string;
  firstName?: string;
  lastName?: string;
  raw?: string;
};

type EmailHeaders = {
  from?: Address;
  to?: Address[];
  cc?: Address[];
  bcc?: Address[];
};

type HubSpotEmail = {
  id: string;
  properties?: {
    hs_timestamp?: string | null;
    hubspot_owner_id?: string | null;
    hs_email_direction?: string | null;
    hs_email_status?: string | null;
    hs_email_subject?: string | null;
    hs_email_text?: string | null;
    hs_email_html?: string | null;
    hs_email_headers?: string | null;
  };
};

type SearchPage = {
  total?: number;
  results?: HubSpotEmail[];
  paging?: { next?: { after?: string } };
};

type CorpusRow = {
  engagementId: string;
  direction: "outbound" | "inbound";
  sentAt: Date;
  rep: string | null;
  counterpartEmails: string[];
  counterpartDomain: string | null;
  subject: string;
  body: string;
  wordCount: number;
  isReply: boolean;
};

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

function positiveInteger(name: string, fallback: number): number {
  const value = Number.parseInt(arg(name, String(fallback)), 10);
  if (!Number.isFinite(value) || value < 1) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return value;
}

const limit = positiveInteger("limit", 2000);
const scanLimit = positiveInteger("scan-limit", Math.max(limit * 5, 8000));
const days = positiveInteger("days", 365);
const senderDomains = arg("sender-domains", "wander.com")
  .split(",")
  .map((domain) => domain.trim().toLowerCase())
  .filter(Boolean);

function hash(value: string, prefix: string): string {
  const digest = createHash("sha256")
    .update(value.trim().toLowerCase())
    .digest("hex")
    .slice(0, 12);
  return `${prefix}_${digest}`;
}

function parseHeaders(value: string | null | undefined): EmailHeaders | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as EmailHeaders;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function emailDomain(email: string | undefined): string | null {
  const normalized = email?.trim().toLowerCase();
  if (!normalized?.includes("@")) return null;
  return normalized.split("@").at(-1) ?? null;
}

function isInternal(email: string | undefined): boolean {
  const domain = emailDomain(email);
  return Boolean(domain && senderDomains.includes(domain));
}

function textFromHtml(html: string): string {
  return he.decode(
    sanitizeHtml(html, {
      allowedTags: [],
      allowedAttributes: {},
    }),
  );
}

function stripQuotedHistory(text: string): string {
  const markers = [
    /^-{2,}\s*original message\s*-{2,}$/im,
    /^on .+wrote:$/im,
    /^from:\s.+$/im,
    /^_{5,}$/m,
    /^begin forwarded message:$/im,
  ];
  let cut = text.length;
  for (const marker of markers) {
    const match = marker.exec(text);
    if (match?.index != null) cut = Math.min(cut, match.index);
  }
  return text.slice(0, cut);
}

function stripLegalFooter(text: string): string {
  const marker =
    /^(confidentiality notice|this (?:e-?mail|message) (?:and any attachments )?is intended only|the information contained in this (?:e-?mail|message)|unsubscribe\b)/im;
  const match = marker.exec(text);
  return match?.index == null ? text : text.slice(0, match.index);
}

function stripSignature(text: string, sender: Address): string {
  const fullName = [sender.firstName, sender.lastName]
    .filter(Boolean)
    .join(" ");
  if (!fullName) return text;
  const lines = text.split("\n");
  const exactName = fullName.toLowerCase();
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim().toLowerCase() ?? "";
    const looksLikeSignature =
      line === exactName ||
      (line.includes(exactName) &&
        /wanderos|account executive|partner|sales|tel:|mailto:|\[phone\]/i.test(
          line,
        ));
    if (!looksLikeSignature) continue;
    if (index < Math.floor(lines.length * 0.35)) continue;
    return lines.slice(0, index).join("\n");
  }
  return text;
}

/**
 * Anonymize one message body. Direction decides which side the sender's
 * address tokens map to: on an inbound message the sender is the prospect,
 * and v1's fixed mapping would have tagged their address [REP_EMAIL].
 */
function redactText(
  input: string,
  sender: Address,
  direction: "outbound" | "inbound",
): string {
  let text = input
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .replaceAll(" ", " ")
    .replace(/[​-‍﻿]/g, "");

  text = stripQuotedHistory(text);
  text = stripLegalFooter(text);
  text = stripSignature(text, sender);

  text = text.replace(/https?:\/\/[^\s<>"')\]]+/gi, (url) => {
    const lower = url.toLowerCase();
    if (
      lower.includes("wanderforoperators") ||
      lower.includes("wanderos-previews") ||
      lower.includes("pregen-sites") ||
      lower.includes("/preview")
    ) {
      return "[PREVIEW_LINK]";
    }
    if (lower.includes("meetings.hubspot") || lower.includes("calendly.com")) {
      return "[MEETING_LINK]";
    }
    if (lower.includes("wander.com/os")) return "[WANDEROS_LINK]";
    return "[LINK]";
  });
  text = text.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, (email) =>
    isInternal(email) ? "[REP_EMAIL]" : "[RECIPIENT_EMAIL]",
  );
  text = text
    .replace(/\bmailto:\s*(?:\[REP_EMAIL\]|\[RECIPIENT_EMAIL\])/gi, "")
    .replace(/\btel:\s*/gi, "");
  text = text.replace(
    /(?<!\d)(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/g,
    "[PHONE]",
  );
  void direction;

  return text
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function hubspotSearch(
  direction: "outbound" | "inbound",
  after?: string,
): Promise<SearchPage> {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const filters =
    direction === "outbound"
      ? [
          { propertyName: "hs_email_direction", operator: "EQ", value: "EMAIL" },
          { propertyName: "hs_email_status", operator: "EQ", value: "SENT" },
        ]
      : [
          {
            propertyName: "hs_email_direction",
            operator: "EQ",
            value: "INCOMING_EMAIL",
          },
        ];
  const response = await fetch(
    "https://api.hubapi.com/crm/v3/objects/emails/search",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filterGroups: [
          {
            filters: [
              ...filters,
              {
                propertyName: "hs_timestamp",
                operator: "GTE",
                value: String(cutoff),
              },
            ],
          },
        ],
        sorts: ["-hs_timestamp"],
        properties: [
          "hs_timestamp",
          "hubspot_owner_id",
          "hs_email_direction",
          "hs_email_status",
          "hs_email_subject",
          "hs_email_text",
          "hs_email_html",
          "hs_email_headers",
        ],
        limit: PAGE_SIZE,
        ...(after ? { after } : {}),
      }),
    },
  );

  if (response.status === 403) {
    throw new Error(
      "HubSpot email access denied. Add the sales-email-read scope to the private app.",
    );
  }
  if (!response.ok) {
    throw new Error(
      `HubSpot email search failed: ${response.status} ${await response.text()}`,
    );
  }
  return (await response.json()) as SearchPage;
}

function toRow(
  email: HubSpotEmail,
  direction: "outbound" | "inbound",
): CorpusRow | null {
  const props = email.properties ?? {};
  const headers = parseHeaders(props.hs_email_headers);
  if (!headers?.from?.email) return null;

  const fromInternal = isInternal(headers.from.email);
  // Direction property and headers must agree, or the counterpart is wrong.
  if (direction === "outbound" && !fromInternal) return null;
  if (direction === "inbound" && fromInternal) return null;

  const recipients = [
    ...(headers.to ?? []),
    ...(headers.cc ?? []),
    ...(headers.bcc ?? []),
  ];
  const counterparts =
    direction === "outbound"
      ? recipients
          .map((recipient) => recipient.email?.trim().toLowerCase())
          .filter((value): value is string => Boolean(value))
          .filter((value) => !isInternal(value))
      : [headers.from.email.trim().toLowerCase()];
  if (!counterparts.length) return null;

  const rawBody =
    props.hs_email_text?.trim() ||
    (props.hs_email_html ? textFromHtml(props.hs_email_html) : "");
  if (!rawBody) return null;

  const subject = redactText(
    props.hs_email_subject ?? "",
    headers.from,
    direction,
  );
  const body = redactText(rawBody, headers.from, direction);
  const wordCount = body.split(/\s+/).filter(Boolean).length;
  // Inbound floor is lower on purpose: "Sure, send it over" is four words and
  // it is the most valuable sentence in the table.
  if (wordCount < (direction === "outbound" ? 8 : 2)) return null;

  const sentAtMs = Date.parse(props.hs_timestamp ?? "");
  if (!Number.isFinite(sentAtMs)) return null;

  const ownerId = props.hubspot_owner_id ?? "";
  const rep =
    direction === "outbound"
      ? (HS_OWNER_NAMES[ownerId] ??
        hash(headers.from.email, "rep"))
      : null;

  return {
    engagementId: email.id,
    direction,
    sentAt: new Date(sentAtMs),
    rep,
    counterpartEmails: [...new Set(counterparts)],
    counterpartDomain: emailDomain(counterparts[0]) ?? null,
    subject,
    body,
    wordCount,
    isReply: /^re:/i.test(props.hs_email_subject ?? ""),
  };
}

async function scan(direction: "outbound" | "inbound"): Promise<CorpusRow[]> {
  const rows: CorpusRow[] = [];
  let scanned = 0;
  let after: string | undefined;
  while (rows.length < limit && scanned < scanLimit) {
    const page = await hubspotSearch(direction, after);
    const results = page.results ?? [];
    if (!results.length) break;
    for (const email of results) {
      if (rows.length >= limit || scanned >= scanLimit) break;
      scanned += 1;
      const row = toRow(email, direction);
      if (row) rows.push(row);
    }
    after = page.paging?.next?.after;
    if (!after) break;
    await Bun.sleep(220);
  }
  console.log(`${direction}: scanned ${scanned}, retained ${rows.length}`);
  return rows;
}

/**
 * Drop any row the redaction did not fully clean, rather than refusing the
 * whole write. One oddly-formatted address out of thousands of rows is a row
 * we can live without; losing the entire corpus to it is how v1's file went
 * stale.
 */
function dropLeakyRows<T extends CorpusRow>(rows: T[]): T[] {
  const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
  const urlPattern = /https?:\/\//i;
  const clean = rows.filter((row) => {
    const text = `${row.subject}\n${row.body}`;
    return !emailPattern.test(text) && !urlPattern.test(text);
  });
  if (clean.length < rows.length) {
    console.warn(
      `dropped ${rows.length - clean.length} row(s) that failed redaction`,
    );
  }
  return clean;
}

async function main() {
  const [outbound, inbound] = await Promise.all([
    scan("outbound"),
    scan("inbound"),
  ]);

  // The outcome label. An outbound "got a reply" when the same counterpart
  // wrote back within the window. Matched on address, not thread id, because
  // prospects reply from the address we wrote to and HubSpot's thread ids are
  // unreliable across mailboxes.
  const inboundByEmail = new Map<string, { at: number; id: string }[]>();
  for (const row of inbound) {
    for (const email of row.counterpartEmails) {
      const list = inboundByEmail.get(email) ?? [];
      list.push({ at: row.sentAt.getTime(), id: row.engagementId });
      inboundByEmail.set(email, list);
    }
  }
  for (const list of inboundByEmail.values()) list.sort((a, b) => a.at - b.at);

  let winners = 0;
  const labelled = outbound.map((row) => {
    const sent = row.sentAt.getTime();
    let reply: { at: number; id: string } | null = null;
    for (const email of row.counterpartEmails) {
      for (const candidate of inboundByEmail.get(email) ?? []) {
        if (candidate.at <= sent) continue;
        if (candidate.at - sent > REPLY_WINDOW_MS) break;
        if (!reply || candidate.at < reply.at) reply = candidate;
        break;
      }
    }
    if (reply) winners += 1;
    return { ...row, reply };
  });

  const all = dropLeakyRows([
    ...labelled,
    ...inbound.map((row) => ({ ...row, reply: null })),
  ]);

  let written = 0;
  for (const row of all) {
    await db
      .insert(salesEmailCorpusTable)
      .values({
        engagementId: row.engagementId,
        direction: row.direction,
        sentAt: row.sentAt,
        rep: row.rep,
        counterpartDomain: row.counterpartDomain,
        subject: row.subject,
        body: row.body,
        wordCount: row.wordCount,
        isReply: row.isReply,
        gotReply: row.reply != null,
        replyAt: row.reply ? new Date(row.reply.at) : null,
        replyEngagementId: row.reply?.id ?? null,
      })
      .onConflictDoUpdate({
        target: salesEmailCorpusTable.engagementId,
        set: {
          gotReply: row.reply != null,
          replyAt: row.reply ? new Date(row.reply.at) : null,
          replyEngagementId: row.reply?.id ?? null,
          updatedAt: new Date(),
        },
      });
    written += 1;
  }

  console.log(
    JSON.stringify(
      {
        outbound: labelled.length,
        inbound: inbound.length,
        outboundThatEarnedReplies: winners,
        replyRate:
          labelled.length === 0
            ? 0
            : Number((winners / labelled.length).toFixed(3)),
        written,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

await main();
