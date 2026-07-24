/**
 * Build a private writing corpus from recent outbound HubSpot sales emails.
 * HubSpot is read-only; output stays under gitignored reports/private/.
 *
 * Required private-app scope: sales-email-read
 *
 *   bun --conditions=react-server scripts/build-hubspot-sales-email-corpus.ts
 *   bun --conditions=react-server scripts/build-hubspot-sales-email-corpus.ts \
 *     --limit 2000 --scan-limit 10000 --days 365
 *
 * The corpus intentionally preserves the names, companies, and prospect-specific
 * language that make the messages useful for personalization. It omits raw
 * HTML, raw headers, addresses, phone numbers, tracking URLs, quoted reply
 * history, and signature blocks.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import he from "he";
import sanitizeHtml from "sanitize-html";

import { env } from "@/env";

const TOKEN = env.HUBSPOT_ACCESS_TOKEN_OPERATED;
if (!TOKEN) throw new Error("HUBSPOT_ACCESS_TOKEN_OPERATED not set");

const DEFAULT_OUT = "reports/private/hubspot-sales-email-corpus/corpus.jsonl";
const DEFAULT_SUMMARY =
  "reports/private/hubspot-sales-email-corpus/summary.json";
const PAGE_SIZE = 200;

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
  sentAt: string;
  repId: string;
  threadId: string;
  isReply: boolean;
  subject: string;
  body: string;
  wordCount: number;
  paragraphCount: number;
  questionCount: number;
  linkTokens: string[];
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

const limit = positiveInteger("limit", 1000);
const scanLimit = positiveInteger("scan-limit", Math.max(limit * 5, 5000));
const days = positiveInteger("days", 365);
const outPath = resolve(arg("out", DEFAULT_OUT));
const summaryPath = resolve(arg("summary", DEFAULT_SUMMARY));
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

function stripRepSignature(text: string, from: Address): string {
  const fullName = [from.firstName, from.lastName].filter(Boolean).join(" ");
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

function replaceLiteral(
  text: string,
  value: string | undefined,
  token: string,
): string {
  const needle = value?.trim();
  if (!needle || needle.length < 2) return text;
  return text.replaceAll(needle, token);
}

function redactText(
  input: string,
  from: Address,
  recipients: Address[],
): string {
  let text = input
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .replaceAll("\u00a0", " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "");

  text = stripQuotedHistory(text);
  text = stripLegalFooter(text);
  text = stripRepSignature(text, from);

  text = replaceLiteral(text, from.email, "[REP_EMAIL]");

  for (const recipient of recipients) {
    text = replaceLiteral(text, recipient.email, "[RECIPIENT_EMAIL]");
  }

  text = text.replace(/https?:\/\/[^\s<>"')\]]+/gi, (url) => {
    const lower = url.toLowerCase();
    if (
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

  return text
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function hubspotSearch(after?: string): Promise<SearchPage> {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
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
              {
                propertyName: "hs_email_direction",
                operator: "EQ",
                value: "EMAIL",
              },
              {
                propertyName: "hs_email_status",
                operator: "EQ",
                value: "SENT",
              },
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

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function assertNoDirectContactLeaks(rows: CorpusRow[]): void {
  const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
  const urlPattern = /https?:\/\//i;
  const phonePattern =
    /(?<!\d)(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/;

  const leaks = rows.flatMap((row) => {
    const text = `${row.subject}\n${row.body}`;
    return [
      emailPattern.test(text) ? `${row.engagementId}:email` : null,
      urlPattern.test(text) ? `${row.engagementId}:url` : null,
      phonePattern.test(text) ? `${row.engagementId}:phone` : null,
    ].filter((value): value is string => Boolean(value));
  });

  if (leaks.length) {
    throw new Error(
      `Refusing to write corpus: direct contact-data redaction failed for ${leaks
        .slice(0, 10)
        .join(", ")}`,
    );
  }
}

async function main() {
  const rows: CorpusRow[] = [];
  const rejectionCounts = {
    missingHeaders: 0,
    nonWanderSender: 0,
    internalOnly: 0,
    emptyBody: 0,
    tooShort: 0,
  };
  let scanned = 0;
  let available = 0;
  let after: string | undefined;

  while (rows.length < limit && scanned < scanLimit) {
    const page = await hubspotSearch(after);
    available ||= page.total ?? 0;
    const results = page.results ?? [];
    if (!results.length) break;

    for (const email of results) {
      if (rows.length >= limit || scanned >= scanLimit) break;
      scanned += 1;

      const props = email.properties ?? {};
      const headers = parseHeaders(props.hs_email_headers);
      if (!headers?.from?.email) {
        rejectionCounts.missingHeaders += 1;
        continue;
      }
      if (!isInternal(headers.from.email)) {
        rejectionCounts.nonWanderSender += 1;
        continue;
      }

      const recipients = [
        ...(headers.to ?? []),
        ...(headers.cc ?? []),
        ...(headers.bcc ?? []),
      ];
      const externalRecipients = recipients.filter(
        (recipient) => recipient.email && !isInternal(recipient.email),
      );
      if (!externalRecipients.length) {
        rejectionCounts.internalOnly += 1;
        continue;
      }

      const rawBody =
        props.hs_email_text?.trim() ||
        (props.hs_email_html ? textFromHtml(props.hs_email_html) : "");
      if (!rawBody) {
        rejectionCounts.emptyBody += 1;
        continue;
      }

      const subject = redactText(
        props.hs_email_subject ?? "",
        headers.from,
        externalRecipients,
      );
      const body = redactText(rawBody, headers.from, externalRecipients);
      const wordCount = body.split(/\s+/).filter(Boolean).length;
      if (wordCount < 8) {
        rejectionCounts.tooShort += 1;
        continue;
      }

      const recipientKey = externalRecipients
        .map((recipient) => recipient.email?.toLowerCase() ?? "")
        .filter(Boolean)
        .sort()
        .join("|");
      const linkTokens =
        body.match(/\[(?:PREVIEW_LINK|MEETING_LINK|WANDEROS_LINK|LINK)\]/g) ??
        [];

      rows.push({
        engagementId: email.id,
        sentAt: props.hs_timestamp ?? "",
        repId: hash(headers.from.email, "rep"),
        threadId: hash(recipientKey, "thread"),
        isReply: /^re:/i.test(props.hs_email_subject ?? ""),
        subject,
        body,
        wordCount,
        paragraphCount: body.split(/\n{2,}/).filter(Boolean).length,
        questionCount: (body.match(/\?/g) ?? []).length,
        linkTokens: [...new Set(linkTokens)],
      });
    }

    after = page.paging?.next?.after;
    if (!after) break;
    await Bun.sleep(220);
  }

  assertNoDirectContactLeaks(rows);

  mkdirSync(dirname(outPath), { recursive: true });
  mkdirSync(dirname(summaryPath), { recursive: true });
  writeFileSync(
    outPath,
    `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`,
    { mode: 0o600 },
  );

  const repIds = new Set(rows.map((row) => row.repId));
  const summary = {
    generatedAt: new Date().toISOString(),
    source: "HubSpot CRM email engagements",
    senderDomains,
    days,
    requestedRows: limit,
    scanLimit,
    availableOutboundSentEmailsInWindow: available,
    scanned,
    retained: rows.length,
    repCount: repIds.size,
    rejectionCounts,
    bodyWords: {
      median: median(rows.map((row) => row.wordCount)),
      average:
        rows.length === 0
          ? 0
          : Math.round(
              rows.reduce((sum, row) => sum + row.wordCount, 0) / rows.length,
            ),
    },
    bodyParagraphsMedian: median(rows.map((row) => row.paragraphCount)),
    subjectCharactersMedian: median(
      rows.map((row) => row.subject.length).filter(Boolean),
    ),
    replyShare:
      rows.length === 0
        ? 0
        : Number(
            (rows.filter((row) => row.isReply).length / rows.length).toFixed(3),
          ),
    questionShare:
      rows.length === 0
        ? 0
        : Number(
            (
              rows.filter((row) => row.questionCount > 0).length / rows.length
            ).toFixed(3),
          ),
    linkShare:
      rows.length === 0
        ? 0
        : Number(
            (
              rows.filter((row) => row.linkTokens.length > 0).length /
              rows.length
            ).toFixed(3),
          ),
    privacyChecks: {
      directEmails: 0,
      directUrls: 0,
      northAmericanPhoneNumbers: 0,
    },
    corpusPath: outPath,
  };
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, {
    mode: 0o600,
  });

  console.log(
    JSON.stringify(
      {
        retained: summary.retained,
        scanned: summary.scanned,
        repCount: summary.repCount,
        bodyWords: summary.bodyWords,
        bodyParagraphsMedian: summary.bodyParagraphsMedian,
        subjectCharactersMedian: summary.subjectCharactersMedian,
        replyShare: summary.replyShare,
        questionShare: summary.questionShare,
        linkShare: summary.linkShare,
        corpusPath: outPath,
        summaryPath,
      },
      null,
      2,
    ),
  );
}

await main();
