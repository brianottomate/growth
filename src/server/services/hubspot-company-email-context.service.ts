import he from "he";
import sanitizeHtml from "sanitize-html";

import { env } from "@/env";
import { cleanCompanyEmailText } from "@/server/services/hubspot-company-email-copy";

type HubSpotAssociationPage = {
  results?: Array<{ toObjectId: number | string }>;
  paging?: { next?: { after?: string } };
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

export type CompanyEmailHistoryItem = {
  engagementId: string;
  sentAt: string;
  direction: "outbound" | "inbound" | "unknown";
  status: string | null;
  ownerId: string | null;
  subject: string;
  body: string;
  operatorTest: boolean;
};

export type CompanyEmailHistory = {
  companyId: string;
  available: number;
  retained: number;
  inbound: number;
  outbound: number;
  items: CompanyEmailHistoryItem[];
};

const EMAIL_PROPERTIES = [
  "hs_timestamp",
  "hubspot_owner_id",
  "hs_email_direction",
  "hs_email_status",
  "hs_email_subject",
  "hs_email_text",
  "hs_email_html",
  "hs_email_headers",
] as const;

type EmailAddress = {
  email?: string;
};

type EmailHeaders = {
  from?: EmailAddress;
  to?: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
};

const OPERATOR_TEST_EMAILS = new Set(["kristian.e.boe@gmail.com"]);

function isOperatorTestEmail(rawHeaders: string | null | undefined): boolean {
  if (!rawHeaders) return false;
  try {
    const headers = JSON.parse(rawHeaders) as EmailHeaders;
    const participants = [
      headers.from,
      ...(headers.to ?? []),
      ...(headers.cc ?? []),
      ...(headers.bcc ?? []),
    ];
    return participants.some((address) =>
      OPERATOR_TEST_EMAILS.has(address?.email?.trim().toLowerCase() ?? ""),
    );
  } catch {
    return false;
  }
}

function token(): string {
  if (!env.HUBSPOT_ACCESS_TOKEN_OPERATED) {
    throw new Error("HUBSPOT_ACCESS_TOKEN_OPERATED is not configured");
  }
  return env.HUBSPOT_ACCESS_TOKEN_OPERATED;
}

async function hubspot<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`https://api.hubapi.com${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token()}`,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(
      `HubSpot ${path} -> ${response.status}: ${await response.text()}`,
    );
  }
  return (await response.json()) as T;
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function textFromHtml(html: string): string {
  return he.decode(
    sanitizeHtml(html, {
      allowedTags: [],
      allowedAttributes: {},
    }),
  );
}

async function listCompanyEmailIds(companyId: string): Promise<string[]> {
  const ids: string[] = [];
  let after: string | undefined;
  do {
    const page = await hubspot<HubSpotAssociationPage>(
      `/crm/v4/objects/companies/${encodeURIComponent(companyId)}/associations/emails?limit=500${
        after ? `&after=${encodeURIComponent(after)}` : ""
      }`,
    );
    ids.push(...(page.results ?? []).map((row) => String(row.toObjectId)));
    after = page.paging?.next?.after;
  } while (after);
  return [...new Set(ids)];
}

async function readEmails(ids: string[]): Promise<HubSpotEmail[]> {
  const emails: HubSpotEmail[] = [];
  for (const batch of chunks(ids, 100)) {
    const page = await hubspot<{ results?: HubSpotEmail[] }>(
      "/crm/v3/objects/emails/batch/read",
      {
        method: "POST",
        body: JSON.stringify({
          inputs: batch.map((id) => ({ id })),
          properties: EMAIL_PROPERTIES,
        }),
      },
    );
    emails.push(...(page.results ?? []));
  }
  return emails;
}

export async function readHubspotCompanyEmailHistory(
  companyId: string,
  options: { limit?: number; maxBodyCharacters?: number } = {},
): Promise<CompanyEmailHistory> {
  const limit = Math.max(1, Math.min(options.limit ?? 20, 100));
  const ids = await listCompanyEmailIds(companyId);
  const emails = await readEmails(ids);
  const items = emails
    .map((email): CompanyEmailHistoryItem | null => {
      const properties = email.properties ?? {};
      const rawBody =
        properties.hs_email_text?.trim() ||
        (properties.hs_email_html
          ? textFromHtml(properties.hs_email_html)
          : "");
      const body = cleanCompanyEmailText(rawBody, options.maxBodyCharacters);
      if (!body) return null;
      const rawDirection = properties.hs_email_direction;
      const direction =
        rawDirection === "EMAIL"
          ? "outbound"
          : rawDirection === "INCOMING_EMAIL"
            ? "inbound"
            : "unknown";
      return {
        engagementId: email.id,
        sentAt: properties.hs_timestamp ?? "",
        direction,
        status: properties.hs_email_status ?? null,
        ownerId: properties.hubspot_owner_id ?? null,
        subject: properties.hs_email_subject?.trim() ?? "",
        body,
        operatorTest: isOperatorTestEmail(properties.hs_email_headers),
      };
    })
    .filter((item): item is CompanyEmailHistoryItem => Boolean(item))
    .sort((left, right) => right.sentAt.localeCompare(left.sentAt))
    .slice(0, limit);

  return {
    companyId,
    available: ids.length,
    retained: items.length,
    inbound: items.filter((item) => item.direction === "inbound").length,
    outbound: items.filter((item) => item.direction === "outbound").length,
    items,
  };
}

export function formatCompanyEmailHistoryForModel(
  history: CompanyEmailHistory,
): string {
  if (!history.items.length) return "No associated email history was found.";
  return history.items
    .map((item) =>
      [
        `[${item.sentAt || "unknown date"} · ${item.direction}]`,
        item.subject ? `Subject: ${item.subject}` : "",
        item.body,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n---\n\n");
}
