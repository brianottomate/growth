import "server-only";

import { z } from "zod";
import { and, desc, eq, exists, isNull, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { leadContactTable, leadDomainTable } from "@/server/db/leads-schema";
import { growthTool } from "./types";

/**
 * Leads headline numbers. NOTE: the `leads` schema is single-tenant / global in
 * this app (decoupled, droppable), so this ignores `ctx.orgId` — it mirrors the
 * `leads.stats` tRPC query the /app/leads page already shows.
 */
export const leadsSummary = growthTool({
  description:
    "Headline numbers for the lead prospecting database: total domains & contacts, how many are in HubSpot / Instantly / pregen, the untouched expansion pool, the net-new sendable cohort, and the top PMS platforms. Use for 'how big is the leads pool / how many leads are we ready to send / what PMS do prospects use' questions.",
  inputSchema: z.object({}),
  execute: async () => {
    const [totals] = await db
      .select({
        domains: sql<number>`count(*)::int`,
        inHubspot: sql<number>`count(*) filter (where ${leadDomainTable.inHubspot})::int`,
        inInstantly: sql<number>`count(*) filter (where ${leadDomainTable.inInstantly})::int`,
        inPregen: sql<number>`count(*) filter (where ${leadDomainTable.inPregen})::int`,
        withPregenSite: sql<number>`count(*) filter (where ${leadDomainTable.pregenSiteUrl} is not null)::int`,
        // expansion pool: known to BuiltWith, never in CRM or pregen
        untouched: sql<number>`count(*) filter (where ${leadDomainTable.inBuiltwith} and not ${leadDomainTable.inHubspot} and not ${leadDomainTable.inPregen})::int`,
      })
      .from(leadDomainTable);

    // Net-new sendable target — same correlated EXISTS the leads list filter and
    // pill badge use (a multi-aggregate FILTER renders unreliably under Drizzle).
    const [netNewRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(leadDomainTable)
      .where(
        and(
          eq(leadDomainTable.inHubspot, false),
          eq(leadDomainTable.hasHubspotDeal, false),
          eq(leadDomainTable.isExistingCustomer, false),
          eq(leadDomainTable.excludeFromOutreach, false),
          eq(leadDomainTable.pregenStatus, "LIVE_RENTAL"),
          exists(
            db
              .select({ one: sql`1` })
              .from(leadContactTable)
              .where(
                and(
                  eq(leadContactTable.domainId, leadDomainTable.id),
                  isNull(leadContactTable.deletedAt),
                  sql`(${leadContactTable.firstName} is not null or ${leadContactTable.lastName} is not null or ${leadContactTable.email} !~* '@(gmail|yahoo|hotmail|aol|outlook|msn|icloud)\\.')`,
                ),
              ),
          ),
        ),
      );

    const [contacts] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(leadContactTable);

    const topPms = await db
      .select({ pms: leadDomainTable.pms, count: sql<number>`count(*)::int` })
      .from(leadDomainTable)
      .where(sql`${leadDomainTable.pms} is not null`)
      .groupBy(leadDomainTable.pms)
      .orderBy(desc(sql`count(*)`))
      .limit(8);

    return {
      ...totals,
      contacts: contacts?.count ?? 0,
      netNew: netNewRow?.count ?? 0,
      topPms,
    };
  },
});
