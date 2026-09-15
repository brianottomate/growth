/**
 * push-top20-instantly.ts — rank the enriched sample, pick the top 20
 * companies, choose up to 3 decision-maker contacts each, and upload them to a
 * NEW Instantly lead list (not attached to any campaign). Writes
 * instantly_lead_id / pushed_to_instantly_at back to leads.contact.
 *
 *   bun scripts/push-top20-instantly.ts --dry-run   # rank + pick, no upload
 *   bun scripts/push-top20-instantly.ts             # create list + upload
 */
import { readFileSync } from "node:fs";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { env } from "@/env";
import { db } from "@/server/db";
import { leadContactTable, leadDomainTable } from "@/server/db/leads-schema";
import { createLead } from "@/server/clients/instantly.client";

const DRY_RUN = process.argv.includes("--dry-run");
const RESULTS = "/tmp/lead-sample-100.txt.results.jsonl";
const LIST_NAME = "Pregen Top 20 — 2026-06-10";
const TOP_N = 20;
const MAX_CONTACTS_PER_DOMAIN = 3;

type EnrichResult = {
  domain: string;
  error?: string;
  unitEstimate: number | null;
  unitRange: [number | null, number | null];
  unitConfidence: "high" | "medium" | "low";
  pregenFit: number;
  tier: string;
  redFlags: string[];
  company: string | null;
};

const DISQUALIFYING =
  /not a (property manager|pm)|marketplace|aggregator|dead|parked|single listing|software|saas/i;

function rankKey(r: EnrichResult): number {
  // Fit leads but portfolio size matters: a 1-unit host is not worth a pregen
  // site even at high fit, and the campaign skews enterprise.
  const units = Math.min(r.unitEstimate ?? 0, 500);
  const conf =
    r.unitConfidence === "high" ? 1 : r.unitConfidence === "medium" ? 0.5 : 0;
  const tinyPenalty = r.unitEstimate != null && r.unitEstimate <= 3 ? 400 : 0;
  return (
    r.pregenFit * 10 + Math.log10(1 + units) * 80 + conf * 10 - tinyPenalty
  );
}

const FREEMAIL =
  /@(gmail|yahoo|hotmail|aol|outlook|msn|icloud|rediffmail|aim|cox|pacbell|comcast|att|cfl\.rr)\./i;

function titleScore(
  title: string | null,
  email: string,
  companyDomain: string,
): number {
  let s = 0;
  if (title) {
    if (/owner|founder|ceo|president|principal|partner/i.test(title)) s += 30;
    else if (
      /director|vp|vice|general manager|\bgm\b|coo|cmo|head of/i.test(title)
    )
      s += 20;
    else s += 10;
  }
  if (email.endsWith(`@${companyDomain}`)) s += 15; // corporate email beats stale freemail
  if (
    /^(info|hello|contact|admin|office|support|reservations|bookings|stay|frontdesk|sales)@/i.test(
      email,
    )
  )
    s -= 25;
  return s;
}

/** Drop contacts with no name AND a freemail address — unverifiable junk. */
function isCredible(c: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}): boolean {
  return !!(c.firstName ?? c.lastName) || !FREEMAIL.test(c.email);
}

async function createLeadList(
  name: string,
): Promise<{ id: string; name: string }> {
  const res = await fetch("https://api.instantly.ai/api/v2/lead-lists", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.INSTANTLY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
  });
  if (!res.ok)
    throw new Error(
      `lead-list create failed: ${res.status} ${await res.text()}`,
    );
  return (await res.json()) as { id: string; name: string };
}

async function main() {
  const results: EnrichResult[] = readFileSync(RESULTS, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as EnrichResult);

  const errored = results.filter((r) => r.error);
  const clean = results.filter(
    (r) => !r.error && !r.redFlags.some((f) => DISQUALIFYING.test(f)),
  );
  console.log(
    `results=${results.length} errored=${errored.length} clean=${clean.length} → picking top ${TOP_N}\n`,
  );

  // Pull contacts for the winning domains.
  const rows = await db
    .select({
      contactId: leadContactTable.id,
      domain: leadContactTable.domain,
      email: leadContactTable.email,
      firstName: leadContactTable.firstName,
      lastName: leadContactTable.lastName,
      jobTitle: leadContactTable.jobTitle,
      phone: leadContactTable.phone,
      companyName: leadDomainTable.companyName,
      pregenSiteUrl: leadDomainTable.pregenSiteUrl,
    })
    .from(leadContactTable)
    .innerJoin(
      leadDomainTable,
      eq(leadDomainTable.id, leadContactTable.domainId),
    )
    .where(
      and(
        inArray(
          leadContactTable.domain,
          clean.map((t) => t.domain),
        ),
        isNull(leadContactTable.deletedAt),
      ),
    );

  const byDomain = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byDomain.get(row.domain) ?? [];
    list.push(row);
    byDomain.set(row.domain, list);
  }

  // Walk the full ranking so a domain whose contacts are all junk gets
  // replaced by the next-best company instead of shrinking the list.
  const ranked = clean.sort((a, b) => rankKey(b) - rankKey(a));
  const picks: { result: EnrichResult; contacts: typeof rows }[] = [];
  for (const r of ranked) {
    if (picks.length >= TOP_N) break;
    const contacts = (byDomain.get(r.domain) ?? [])
      .filter(isCredible)
      .sort(
        (a, b) =>
          titleScore(b.jobTitle, b.email, r.domain) -
          titleScore(a.jobTitle, a.email, r.domain),
      )
      .slice(0, MAX_CONTACTS_PER_DOMAIN);
    if (!contacts.length) continue;
    picks.push({ result: r, contacts });
  }

  for (const { result: r, contacts } of picks) {
    console.log(
      `${r.domain.padEnd(36)} fit=${String(r.pregenFit).padStart(3)} units=${String(r.unitEstimate ?? "?").padStart(5)} (${r.unitConfidence}) ${r.tier.padEnd(9)} ${r.company ?? ""}`,
    );
    for (const c of contacts) {
      console.log(
        `    ${c.email.padEnd(44)} ${[c.firstName, c.lastName].filter(Boolean).join(" ").padEnd(24)} ${c.jobTitle ?? ""}`,
      );
    }
  }

  const totalContacts = picks.reduce((n, p) => n + p.contacts.length, 0);
  console.log(`\n${picks.length} companies, ${totalContacts} contacts`);

  if (DRY_RUN) {
    console.log("(dry run — nothing uploaded)");
    process.exit(0);
  }

  const list = await createLeadList(LIST_NAME);
  console.log(`\nCreated lead list "${list.name}" (${list.id})`);

  let uploaded = 0;
  let failed = 0;
  for (const { result: r, contacts } of picks) {
    for (const c of contacts) {
      try {
        const lead = await createLead({
          list_id: list.id,
          email: c.email,
          first_name: c.firstName ?? undefined,
          last_name: c.lastName ?? undefined,
          company_name: c.companyName ?? r.company ?? undefined,
          job_title: c.jobTitle ?? undefined,
          phone: c.phone ?? undefined,
          website: `https://${r.domain}`,
          skip_if_in_workspace: true,
          verify_leads_on_import: true,
          custom_variables: {
            domain: r.domain,
            pregen_site_url: picksUrl(c.pregenSiteUrl),
            unit_estimate: r.unitEstimate,
            unit_range: `${r.unitRange[0] ?? "?"}–${r.unitRange[1] ?? "?"}`,
            unit_confidence: r.unitConfidence,
            pregen_fit: r.pregenFit,
            tier: r.tier,
          },
        });
        await db
          .update(leadContactTable)
          .set({ instantlyLeadId: lead.id, pushedToInstantlyAt: new Date() })
          .where(eq(leadContactTable.id, c.contactId));
        uploaded++;
        console.log(`  ✓ ${c.email} → ${lead.id}`);
      } catch (e) {
        failed++;
        console.log(
          `  ✗ ${c.email} → ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }

  console.log(
    `\nDone. uploaded=${uploaded} failed=${failed} list="${LIST_NAME}"`,
  );
  process.exit(0);
}

function picksUrl(u: string | null): string | null {
  return u?.trim() ? u.trim() : null;
}

void main();
