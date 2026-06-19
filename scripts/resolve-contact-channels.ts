/**
 * resolve-contact-channels.ts — for each enriched net-new domain, scrape the
 * company's OWN site for the real contact channel (corporate email / contact
 * form), since our stored contact list is mostly mis-associated freemail.
 *
 * First pass: plain fetch + regex over homepage + /contact(-us) + /about. No LLM.
 * (JS-heavy sites that come back empty are flagged for a firecrawl follow-up.)
 *
 * Writes per domain into leads.domain.enrichment.contactChannel (additive merge)
 * and a review table to /tmp/contact-channels-<n>.md, routed:
 *   → instantly  (a usable email was found on the site)
 *   → form       (no email, but a contact form exists)
 *   → none       (neither — needs manual / firecrawl)
 *
 * Read-only on the web; the only DB writes are the additive enrichment merge.
 *   bun --conditions react-server scripts/resolve-contact-channels.ts
 */
import { writeFileSync } from "node:fs";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { leadDomainTable } from "@/server/db/leads-schema";

const CONCURRENCY = 10;
const TIMEOUT_MS = 10_000;

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const FREEMAIL = /@(gmail|yahoo|hotmail|aol|outlook|msn|icloud|comcast|att|live|me|mac)\./i;
const ROLE = /^(info|hello|contact|admin|office|hi|team|stay|book|bookings|reservations|sales|rentals|owner|owners|support|frontdesk|reception|enquiries|inquiries)@/i;
// Junk that the email regex catches from markup/assets.
const JUNK_DOMAIN = /\.(png|jpg|jpeg|gif|svg|webp|css|js|woff|ttf)$|sentry|wixpress|example\.|schema\.org|w3\.org|googleapis|gstatic|cloudflare|jquery|bootstrap|fontawesome|\.wix|sentry\.io/i;

type Resolved = {
  domain: string;
  companyName: string | null;
  emails: string[];
  corporate: string[];
  roleInbox: string[];
  siteFreemail: string[];
  hasForm: boolean;
  bestEmail: string | null;
  route: "instantly" | "form" | "none";
  pagesOk: number;
};

async function fetchText(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 (compatible; WanderGrowthBot/1.0)" },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function resolveOne(d: { id: string; domain: string; companyName: string | null }): Promise<Resolved> {
  const paths = ["/contact", "/contact-us", "/", "/about", "/about-us"];
  const found = new Set<string>();
  let hasForm = false;
  let pagesOk = 0;

  for (const base of [`https://${d.domain}`, `https://www.${d.domain}`]) {
    for (const p of paths) {
      const html = await fetchText(base + p);
      if (html == null) continue;
      pagesOk++;
      if (/<form\b/i.test(html) || /mailto:/i.test(html)) hasForm ||= /<form\b/i.test(html);
      for (const m of html.matchAll(EMAIL_RE)) {
        const e = m[0].toLowerCase();
        if (!JUNK_DOMAIN.test(e)) found.add(e);
      }
      // a /contact page that loaded is enough signal for the form question
      if (p.startsWith("/contact") && /<form\b/i.test(html)) hasForm = true;
    }
    if (found.size || pagesOk) break; // got the apex; skip www unless apex gave nothing
  }

  const emails = [...found];
  const corporate = emails.filter((e) => e.endsWith(`@${d.domain}`) || e.endsWith(`@www.${d.domain}`));
  const roleInbox = corporate.filter((e) => ROLE.test(e));
  const siteFreemail = emails.filter((e) => FREEMAIL.test(e));
  // Best: a corporate role inbox (info@) > any corporate > a freemail listed on the
  // site (owner's stated email, more trustworthy than our appended DB freemail).
  const bestEmail = roleInbox[0] ?? corporate[0] ?? siteFreemail[0] ?? null;
  const route: Resolved["route"] = bestEmail ? "instantly" : hasForm ? "form" : "none";

  return { domain: d.domain, companyName: d.companyName, emails, corporate, roleInbox, siteFreemail, hasForm, bestEmail, route, pagesOk };
}

// enriched net-new domains (the ~100+ we scored)
const domains = await db
  .select({ id: leadDomainTable.id, domain: leadDomainTable.domain, companyName: leadDomainTable.companyName })
  .from(leadDomainTable)
  .where(
    and(
      isNull(leadDomainTable.deletedAt),
      eq(leadDomainTable.inHubspot, false),
      eq(leadDomainTable.pregenStatus, "LIVE_RENTAL"),
      isNotNull(leadDomainTable.scorePregenPotential),
    ),
  );

console.log(`Resolving contact channels for ${domains.length} enriched net-new domains…`);

const results: Resolved[] = new Array(domains.length);
let cursor = 0;
let done = 0;
async function worker() {
  while (cursor < domains.length) {
    const i = cursor++;
    const d = domains[i]!;
    const r = await resolveOne(d);
    results[i] = r;
    await db
      .update(leadDomainTable)
      .set({
        enrichment: sql`coalesce(${leadDomainTable.enrichment}, '{}'::jsonb) || ${JSON.stringify({
          contactChannel: { ...r, scrapedAt: undefined },
        })}::jsonb`,
      })
      .where(eq(leadDomainTable.id, d.id));
    done++;
    if (done % 20 === 0) console.log(`  …${done}/${domains.length}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

const byRoute = (route: string) => results.filter((r) => r.route === route);
const md: string[] = [];
md.push(`# Contact channels — ${results.length} enriched net-new domains\n`);
md.push(`Routed: **${byRoute("instantly").length} → Instantly** (email found) · **${byRoute("form").length} → form queue** · **${byRoute("none").length} → none/manual**\n`);
for (const route of ["instantly", "form", "none"] as const) {
  md.push(`\n## → ${route} (${byRoute(route).length})\n`);
  md.push(`| domain | company | best email | corporate | site-freemail | form |`);
  md.push(`|---|---|---|--:|--:|:-:|`);
  for (const r of byRoute(route).sort((a, b) => b.corporate.length - a.corporate.length)) {
    md.push(`| ${r.domain} | ${(r.companyName ?? "").replace(/\|/g, "/")} | ${r.bestEmail ?? "—"} | ${r.corporate.length} | ${r.siteFreemail.length} | ${r.hasForm ? "✓" : ""} |`);
  }
}
const out = `/tmp/contact-channels-${results.length}.md`;
writeFileSync(out, md.join("\n"));

console.log(`\nDone. ${byRoute("instantly").length} → Instantly · ${byRoute("form").length} → form · ${byRoute("none").length} → none`);
console.log(`corporate-email found on site: ${results.filter((r) => r.corporate.length > 0).length}/${results.length}`);
console.log(`Report: ${out}`);
process.exit(0);
