/**
 * TEMPORARY — generate pregen sequences for already-ranked prospects and store
 * them as drafts so /app/leads/send-review renders them. Delete when the real
 * generation engine supplies preview URLs.
 *
 *   bun --conditions=react-server scripts/tmp-gen-sequences.ts a.com b.com
 *
 * Generates against the domain's real stored pregenSiteUrl. The generator reads
 * the preview's own content, so an unreachable URL yields copy that only looks
 * personalized — it silently loses the preview half of its context. Most stored
 * previews sit on retired per-company localcan tunnels and are dead, so the URL
 * is probed first and the domain is skipped unless ALLOW_UNREACHABLE=1.
 */
import { and, eq } from "drizzle-orm";

import { db } from "@/server/db";
import {
  hubspotListMembershipTable,
  leadDomainTable,
  leadOutreachTable,
} from "@/server/db/leads-schema";
import { generatePregenHubspotDraft } from "@/server/services/pregen-hubspot-outreach.service";

const DOMAINS = process.argv.slice(2).filter((a) => a.includes("."));
const ALLOW_UNREACHABLE = process.env.ALLOW_UNREACHABLE === "1";
/** Generate and print the provenance snapshot without touching leads.outreach. */
const DRY_RUN = process.env.DRY_RUN === "1";

async function previewIsReachable(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    return res.status;
  } catch {
    return null;
  }
}

for (const domain of DOMAINS) {
  const row = await db.query.leadDomainTable.findFirst({
    where: eq(leadDomainTable.domain, domain),
  });
  if (!row) {
    console.log(`\n### ${domain}: not in leads.domain`);
    continue;
  }
  if (row.excludeFromOutreach) {
    console.log(
      `\n### ${domain}: excluded from outreach (${row.excludeReason ?? "no reason recorded"}) — skipped`,
    );
    continue;
  }
  const [m] = await db
    .select({ cohort: hubspotListMembershipTable.cohort })
    .from(hubspotListMembershipTable)
    .where(
      and(
        eq(hubspotListMembershipTable.domainId, row.id),
        eq(hubspotListMembershipTable.objectType, "company"),
      ),
    )
    .limit(1);
  const motion = m?.cohort === "recycled" ? "reengagement" : "fresh";

  const previewUrl = row.pregenSiteUrl;
  if (!previewUrl) {
    console.log(`\n### ${domain}: no pregenSiteUrl — assign a preview first`);
    continue;
  }
  const status = await previewIsReachable(previewUrl);

  try {
    // The generator refuses an unreadable preview itself, so this only forwards
    // the override; the probe above is kept for the status line in the output.
    const r = await generatePregenHubspotDraft(domain, {
      motion,
      previewUrl,
      allowUnreachablePreview: ALLOW_UNREACHABLE,
    });

    if (DRY_RUN) {
      console.log(`\n### ${domain}: DRY_RUN — nothing written`);
      console.log(JSON.stringify(r.generationContext, null, 2));
    } else {
      await db
        .delete(leadOutreachTable)
        .where(
          and(
            eq(leadOutreachTable.domainId, row.id),
            eq(leadOutreachTable.status, "draft"),
          ),
        );
      await db.insert(leadOutreachTable).values({
        domainId: row.id,
        domain: row.domain,
        status: "draft",
        angle: r.draft.angle,
        personalizedOn: [
          ...r.draft.personalizedOn,
          ...r.draft.historyUsed.map((v) => `History: ${v}`),
        ],
        steps: r.renderedSteps,
        generationContext: r.generationContext,
        model: r.model,
      });
    }

    console.log(`\n${"=".repeat(74)}`);
    console.log(`### ${domain} · ${motion} · rank ${row.scorePregenPotential}`);
    console.log(`PREVIEW: ${previewUrl} (${status})`);
    console.log(`ANGLE: ${r.draft.angle}`);
    console.log(`PERSONALIZED ON: ${r.draft.personalizedOn.join(" | ")}`);
    if (r.draft.historyUsed.length)
      console.log(`HISTORY: ${r.draft.historyUsed.join(" | ")}`);
    r.draft.touches.forEach((t, i) => {
      console.log(
        `\n--- TOUCH ${i + 1} (day ${t.delayDays})${t.subject ? ` subj: ${t.subject}` : " [in-thread]"}`,
      );
      console.log(t.opening);
      if (i === 0) console.log(`\n  {{ preview URL renders here }}\n`);
      console.log(t.closing);
    });
  } catch (e) {
    console.log(
      `\n### ${domain}: FAILED — ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}
