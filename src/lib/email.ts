// Ported verbatim from wander.com src/utils/email.ts (inbound-router dependency).
// Personal-provider detection decides whether an email domain is usable for a
// HubSpot company lookup — gmail.com is not a company.

const PERSONAL_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "ymail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "protonmail.com",
  "proton.me",
  "gmx.com",
  "gmx.net",
  "mail.com",
  "zoho.com",
  "yandex.com",
  "fastmail.com",
]);

// Catches TLD typos — `gmail.co`, `yahoo.con`, `hotmail.cm` — that would
// otherwise slip past the exact-domain check.
const PERSONAL_EMAIL_PROVIDER_BASES = new Set([
  "gmail",
  "googlemail",
  "yahoo",
  "ymail",
  "outlook",
  "hotmail",
  "live",
  "msn",
  "icloud",
  "aol",
  "protonmail",
  "proton",
  "gmx",
  "fastmail",
  "yandex",
  "zoho",
]);

export function getEmailDomain(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  return at === -1 ? "" : trimmed.slice(at + 1);
}

export function isPersonalEmail(email: string): boolean {
  const domain = getEmailDomain(email);
  if (!domain) return false;
  if (PERSONAL_EMAIL_DOMAINS.has(domain)) return true;
  const base = domain.split(".")[0];
  return base ? PERSONAL_EMAIL_PROVIDER_BASES.has(base) : false;
}
