/**
 * TEMPORARY — generate pregen sequences for already-ranked prospects and store
 * them as drafts so /app/leads/send-review renders them. Delete when the real
 * generation engine supplies preview URLs.
 *
 *   bun --conditions=react-server scripts/tmp-gen-sequences.ts a.com b.com
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
// No previews exist yet; shape mirrors the real signed /p/<id>?t= path.
const standin = (d: string) =>
  `https://preview.wander.com/p/standin-${d.replace(/\W/g, "-")}?t=eval`;

for (const domain of DOMAINS) {
  const row = await db.query.leadDomainTable.findFirst({
    where: eq(leadDomainTable.domain, domain),
  });
  if (!row) {
    console.log(`\n### ${domain}: not in leads.domain`);
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

  try {
    const r = await generatePregenHubspotDraft(domain, {
      motion,
      previewUrl: standin(domain),
    });

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
      model: r.model,
    });

    console.log(`\n${"=".repeat(74)}`);
    console.log(`### ${domain} · ${motion} · rank ${row.scorePregenPotential}`);
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
