import "server-only";

import { sql } from "drizzle-orm";

import type { LeadContactVerification } from "@/server/db/leads-schema";

export type LeadChannelRoute = "instantly" | "form" | "none";
export type LeadChannelVerdict = "send" | "review" | "form" | "skip";

export type StoredLeadContact = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  jobTitle: string | null;
  verificationStatus?: string | null;
  // Person-verification evidence from the trust layer (Minerva geo + LinkedIn).
  verification?: LeadContactVerification | null;
};

export type ResolvedContactChannel = {
  domain: string;
  companyName: string | null;
  emails: string[];
  corporate: string[];
  roleInbox: string[];
  siteFreemail: string[];
  hasForm: boolean;
  bestEmail: string | null;
  route: LeadChannelRoute;
  pagesOk: number;
  scrapedAt?: string;
};

export type ContactCandidateScore = {
  kind: "site" | "stored";
  email: string;
  name: string | null;
  title: string | null;
  score: number;
  verdict: LeadChannelVerdict;
  reasons: string[];
  risks: string[];
};

export type ChannelScore = {
  route: LeadChannelRoute;
  verdict: LeadChannelVerdict;
  bestEmail: string | null;
  score: number;
  reasons: string[];
  risks: string[];
  candidates: ContactCandidateScore[];
};

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const FREEMAIL =
  /@(gmail|yahoo|hotmail|aol|outlook|msn|icloud|comcast|att|live|me|mac|rediffmail|aim|cox|pacbell|cfl\.rr)\./i;
const ROLE =
  /^(info|hello|contact|admin|office|hi|team|stay|book|bookings|reservations|sales|rentals|owner|owners|support|frontdesk|reception|enquiries|inquiries)@/i;
const JUNK_DOMAIN =
  /\.(png|jpg|jpeg|gif|svg|webp|css|js|woff|ttf)$|sentry|wixpress|example\.|schema\.org|w3\.org|googleapis|gstatic|jquery|bootstrap|fontawesome|\.wix|sentry\.io/i;
const DECISION_MAKER =
  /owner|founder|ceo|president|principal|partner|director|vp|vice|general manager|\bgm\b|coo|cmo|head/i;

const TIMEOUT_MS = 10_000;

/**
 * Placeholder mailboxes that exist to satisfy a required field, not to be
 * written to. HubSpot's appended-contact rows carry `<numeric-id>@fake-email.com`
 * — 203,237 of 325,640 contacts, spread over 177,868 domains — and they used to
 * score 55 on the strength of a name and a job title, level with a real
 * corporate address, and could be picked as the selected channel.
 *
 * Matched on the exact domain, never as a substring: real prospects include
 * `corporatestays.com` and `elevatestr.com`, both of which contain "test".
 */
export const PLACEHOLDER_EMAIL_DOMAINS = [
  "fake-email.com",
  "fakeemail.com",
  "test.com",
  "testing.com",
  "example.com",
  "example.net",
  "example.org",
  "mailinator.com",
] as const;

export function isPlaceholderEmail(email: string): boolean {
  const host = email.trim().toLowerCase().split("@")[1];
  return host != null && PLACEHOLDER_EMAIL_DOMAINS.includes(host as never);
}

/**
 * The same list as a SQL array, so the enrollable counts, the enrollable-only
 * list filter and the chat summary all exclude exactly what the scorer zeroes.
 * These three drifting apart is how the page came to advertise 497 enrollable
 * untouched companies when 372 have a deliverable address.
 */
export const PLACEHOLDER_EMAIL_DOMAINS_SQL = sql`array[${sql.join(
  PLACEHOLDER_EMAIL_DOMAINS.map((domain) => sql`${domain}`),
  sql`, `,
)}]::text[]`;

function isFreemail(email: string): boolean {
  return FREEMAIL.test(email);
}

/** Public freemail check — used to pick which contacts are worth verifying. */
export function isFreemailEmail(email: string): boolean {
  return isFreemail(email);
}

function isCorporateForDomain(email: string, domain: string): boolean {
  const normalized = domain.toLowerCase();
  return (
    email.endsWith(`@${normalized}`) || email.endsWith(`@www.${normalized}`)
  );
}

function verdictFor(
  score: number,
  route: LeadChannelRoute,
): LeadChannelVerdict {
  if (route === "form") return "form";
  if (score >= 70) return "send";
  if (score >= 40) return "review";
  return "skip";
}

async function fetchText(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; WanderGrowthBot/1.0)",
      },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveContactChannel(input: {
  domain: string;
  companyName: string | null;
}): Promise<ResolvedContactChannel> {
  const paths = ["/contact", "/contact-us", "/", "/about", "/about-us"];
  const found = new Set<string>();
  let hasForm = false;
  let pagesOk = 0;

  for (const base of [
    `https://${input.domain}`,
    `https://www.${input.domain}`,
  ]) {
    for (const path of paths) {
      const html = await fetchText(base + path);
      if (html == null) continue;

      pagesOk++;
      if (/<form\b/i.test(html)) hasForm = true;

      for (const match of html.matchAll(EMAIL_RE)) {
        const email = match[0].toLowerCase();
        if (!JUNK_DOMAIN.test(email)) found.add(email);
      }
    }
    if (found.size || pagesOk) break;
  }

  return buildResolvedChannel({
    domain: input.domain,
    companyName: input.companyName,
    emails: [...found],
    hasForm,
    pagesOk,
  });
}

/**
 * Classify a set of scraped emails (+ a form-present flag) into a
 * `ResolvedContactChannel`: split corporate / role-inbox / freemail, pick the
 * best email, and derive the route. Shared by the naive `resolveContactChannel`
 * scraper and the richer Firecrawl-based `discoverContactChannels` so the
 * email-quality logic lives in exactly one place.
 */
export function buildResolvedChannel(input: {
  domain: string;
  companyName: string | null;
  emails: string[];
  hasForm: boolean;
  pagesOk?: number;
  scrapedAt?: string;
}): ResolvedContactChannel {
  const emails = [...new Set(input.emails.map((e) => e.toLowerCase()))].filter(
    (e) => !JUNK_DOMAIN.test(e),
  );
  const corporate = emails.filter((email) =>
    isCorporateForDomain(email, input.domain),
  );
  const roleInbox = corporate.filter((email) => ROLE.test(email));
  const siteFreemail = emails.filter(isFreemail);
  const bestEmail = roleInbox[0] ?? corporate[0] ?? siteFreemail[0] ?? null;
  const route: LeadChannelRoute = bestEmail
    ? "instantly"
    : input.hasForm
      ? "form"
      : "none";

  return {
    domain: input.domain,
    companyName: input.companyName,
    emails,
    corporate,
    roleInbox,
    siteFreemail,
    hasForm: input.hasForm,
    bestEmail,
    route,
    pagesOk: input.pagesOk ?? 0,
    scrapedAt: input.scrapedAt ?? new Date().toISOString(),
  };
}

export function parseContactChannel(
  value: unknown,
): ResolvedContactChannel | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<ResolvedContactChannel>;
  if (!raw.domain || typeof raw.domain !== "string") return null;

  return {
    domain: raw.domain,
    companyName: raw.companyName ?? null,
    emails: Array.isArray(raw.emails) ? raw.emails : [],
    corporate: Array.isArray(raw.corporate) ? raw.corporate : [],
    roleInbox: Array.isArray(raw.roleInbox) ? raw.roleInbox : [],
    siteFreemail: Array.isArray(raw.siteFreemail) ? raw.siteFreemail : [],
    hasForm: Boolean(raw.hasForm),
    bestEmail: raw.bestEmail ?? null,
    route:
      raw.route === "instantly" || raw.route === "form" || raw.route === "none"
        ? raw.route
        : raw.bestEmail
          ? "instantly"
          : raw.hasForm
            ? "form"
            : "none",
    pagesOk: Number.isFinite(raw.pagesOk) ? Number(raw.pagesOk) : 0,
    scrapedAt: raw.scrapedAt,
  };
}

/**
 * Whether an address is a shared inbox rather than a person. Exported because
 * "who do we write to" and "which mailbox do we send to" are different
 * questions: a role inbox is a fine destination for a form-fill or a cold
 * send, and a poor one to address by name about a call they were on.
 */
export function isRoleInbox(email: string): boolean {
  return ROLE.test(email.trim());
}

export function scoreStoredContact(
  contact: StoredLeadContact,
  domain: string,
  options: {
    /**
     * How many times this person is named in the logged HubSpot history.
     *
     * The strongest ranking signal we have, and it was missing. Everything else
     * here reasons about whether an address is deliverable and whether the
     * person looks senior. Whether our own team has actually spoken to them is
     * better evidence than either, and it is the difference between two
     * contacts at one company who are otherwise identical on paper.
     *
     * Zero when history was not loaded, which leaves scoring exactly as it was.
     */
    historyMentions?: number;
  } = {},
): ContactCandidateScore {
  let score = 20;
  const reasons: string[] = [];
  const risks: string[] = [];
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ");

  // Hard zero, before any promoter runs. A name and a decision-maker title are
  // exactly what these rows carry, so scoring them additively rated an
  // undeliverable address as reviewable — and "has a named person" read as
  // evidence *for* a mailbox that cannot receive mail.
  if (isPlaceholderEmail(contact.email)) {
    return {
      kind: "stored",
      email: contact.email,
      name: name || null,
      title: contact.jobTitle,
      score: 0,
      verdict: "skip",
      reasons: [],
      risks: [
        `${contact.email.split("@")[1]} is a placeholder mailbox, not a deliverable address`,
      ],
    };
  }

  if (isCorporateForDomain(contact.email, domain)) {
    score += 30;
    reasons.push("corporate-domain email");
  }
  if (ROLE.test(contact.email)) {
    score -= 10;
    risks.push("role inbox from appended contact list");
  }
  if (isFreemail(contact.email)) {
    score -= 25;
    risks.push("freemail from appended contact list");
  }
  if (name) {
    score += 10;
    reasons.push("has a named person");
  } else if (isFreemail(contact.email)) {
    score -= 30;
    risks.push("no name plus freemail");
  }
  if (contact.jobTitle) {
    score += DECISION_MAKER.test(contact.jobTitle) ? 25 : 10;
    reasons.push(contact.jobTitle);
  }
  if (contact.verificationStatus) {
    reasons.push(`verification: ${contact.verificationStatus}`);
  }

  // Capped, because the count is a proxy for "this is who the conversation is
  // with" and not a quantity worth maximising. Five mentions and fifty mean the
  // same thing next to a contact with none.
  const mentions = Math.max(0, options.historyMentions ?? 0);
  if (mentions > 0) {
    score += 20 + Math.min(mentions, 5) * 4;
    reasons.push(
      mentions === 1
        ? "named once in our logged calls and emails"
        : `named ${mentions} times in our logged calls and emails`,
    );
  }

  // Trust layer: person-verification evidence (Minerva geo + LinkedIn).
  // Geo match is the primary promoter — the playbook's rule is "send only where
  // Minerva geo matches the company area". A mismatch is a *soft* downgrade, not
  // a hard block: STR owners are frequently remote from their rentals.
  const v = contact.verification;
  if (v) {
    if (v.geoMatch === "match") {
      score += 35;
      reasons.push("Minerva geo matches company area");
    } else if (v.geoMatch === "mismatch") {
      score -= 25;
      const where = v.minerva?.city ?? v.minerva?.state ?? "another area";
      risks.push(`person appears to be in ${where}`);
    } else if (v.minerva && !v.minerva.isMatch) {
      risks.push("Minerva could not resolve this person");
    }

    if (v.companyMatch === "match") {
      score += 30;
      reasons.push("LinkedIn current company matches");
    } else if (v.companyMatch === "mismatch") {
      score -= 20;
      risks.push(
        v.linkedin?.currentCompany
          ? `LinkedIn shows a different employer (${v.linkedin.currentCompany})`
          : "LinkedIn shows a different employer",
      );
    }
  }

  return {
    kind: "stored",
    email: contact.email,
    name: name || null,
    title: contact.jobTitle,
    score,
    verdict: verdictFor(score, "instantly"),
    reasons,
    risks,
  };
}

function scoreSiteEmail(email: string, domain: string): ContactCandidateScore {
  let score = 45;
  const reasons = ["found on company website"];
  const risks: string[] = [];

  if (isCorporateForDomain(email, domain)) {
    score += 25;
    reasons.push("corporate-domain email");
  }
  if (ROLE.test(email)) {
    score += 5;
    reasons.push("role inbox is acceptable for small operators");
  }
  if (isFreemail(email)) {
    score -= 15;
    risks.push("site-listed freemail");
  }

  return {
    kind: "site",
    email,
    name: null,
    title: null,
    score,
    verdict: verdictFor(score, "instantly"),
    reasons,
    risks,
  };
}

export function scoreLeadChannel(input: {
  domain: string;
  contactChannel: ResolvedContactChannel | null;
  contacts: StoredLeadContact[];
  /** Mentions in logged HubSpot history, keyed by lowercased email. */
  historyMentions?: Map<string, number>;
}): ChannelScore {
  const candidates = [
    ...(input.contactChannel?.emails ?? []).map((email) =>
      scoreSiteEmail(email, input.domain),
    ),
    ...input.contacts.map((contact) =>
      scoreStoredContact(contact, input.domain, {
        historyMentions: input.historyMentions?.get(
          contact.email.toLowerCase(),
        ),
      }),
    ),
  ].sort((a, b) => b.score - a.score);

  const route = input.contactChannel?.route ?? "none";
  const bestSiteEmail = input.contactChannel?.bestEmail ?? null;
  // A placeholder mailbox must never become the selected channel, even when it
  // is the only row on the company. skywatercabins.com has exactly one contact
  // and it is a placeholder, which used to render as its selected channel.
  // Every candidate stays in `candidates` so the reviewer can still see why.
  const bestCandidate =
    candidates.find((candidate) => !isPlaceholderEmail(candidate.email)) ??
    null;
  const bestEmail = bestSiteEmail ?? bestCandidate?.email ?? null;

  if (route === "form" && !bestEmail) {
    return {
      route,
      verdict: "form",
      bestEmail: null,
      score: 50,
      reasons: ["contact form found on company website"],
      risks: [],
      candidates,
    };
  }

  const score = bestCandidate?.score ?? 0;
  const reasons = bestCandidate?.reasons ?? [];
  const risks = bestCandidate?.risks ?? [];

  return {
    route: bestEmail ? "instantly" : route,
    verdict: verdictFor(score, bestEmail ? "instantly" : route),
    bestEmail,
    score,
    reasons,
    risks,
    candidates,
  };
}
