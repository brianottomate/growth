import "server-only";

export type LeadChannelRoute = "instantly" | "form" | "none";
export type LeadChannelVerdict = "send" | "review" | "form" | "skip";

export type StoredLeadContact = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  jobTitle: string | null;
  verificationStatus?: string | null;
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
  /\.(png|jpg|jpeg|gif|svg|webp|css|js|woff|ttf)$|sentry|wixpress|example\.|schema\.org|w3\.org|googleapis|gstatic|cloudflare|jquery|bootstrap|fontawesome|\.wix|sentry\.io/i;
const DECISION_MAKER =
  /owner|founder|ceo|president|principal|partner|director|vp|vice|general manager|\bgm\b|coo|cmo|head/i;

const TIMEOUT_MS = 10_000;

function isFreemail(email: string): boolean {
  return FREEMAIL.test(email);
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

  const emails = [...found];
  const corporate = emails.filter((email) =>
    isCorporateForDomain(email, input.domain),
  );
  const roleInbox = corporate.filter((email) => ROLE.test(email));
  const siteFreemail = emails.filter(isFreemail);
  const bestEmail = roleInbox[0] ?? corporate[0] ?? siteFreemail[0] ?? null;
  const route: LeadChannelRoute = bestEmail
    ? "instantly"
    : hasForm
      ? "form"
      : "none";

  return {
    domain: input.domain,
    companyName: input.companyName,
    emails,
    corporate,
    roleInbox,
    siteFreemail,
    hasForm,
    bestEmail,
    route,
    pagesOk,
    scrapedAt: new Date().toISOString(),
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

export function scoreStoredContact(
  contact: StoredLeadContact,
  domain: string,
): ContactCandidateScore {
  let score = 20;
  const reasons: string[] = [];
  const risks: string[] = [];
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ");

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
}): ChannelScore {
  const candidates = [
    ...(input.contactChannel?.emails ?? []).map((email) =>
      scoreSiteEmail(email, input.domain),
    ),
    ...input.contacts.map((contact) =>
      scoreStoredContact(contact, input.domain),
    ),
  ].sort((a, b) => b.score - a.score);

  const route = input.contactChannel?.route ?? "none";
  const bestSiteEmail = input.contactChannel?.bestEmail ?? null;
  const bestCandidate = candidates[0] ?? null;
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
