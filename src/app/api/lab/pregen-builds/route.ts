import { and, eq, inArray, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { CURRENT_PREGEN_BATCH } from "@/lib/pregen-batch";
import {
  createWebsiteProspect,
  isWanderApiConfigured,
} from "@/server/clients/wander.client";
import { db } from "@/server/db";
import { leadDomainTable, pregenBuildTable } from "@/server/db/leads-schema";
import { assertLabAccess } from "@/server/lab-access";

/**
 * Fire pregen builds against the WanderOS API this deployment is configured
 * for, from a script rather than the per-row button in `/app/leads`.
 *
 * The reason it exists on the server instead of in `scripts/`: the prod service
 * key is a sensitive Vercel env var, so `vercel env pull` returns `[SENSITIVE]`
 * and a local run can only ever reach staging. Prod builds therefore have to be
 * asked for by something already holding the prod key, which is this app.
 *
 * Blast radius is bounded by the batch, not by the caller. Only domains stamped
 * into `CURRENT_PREGEN_BATCH` are buildable here, so the worst a leaked
 * ADMIN_TOKEN buys is rebuilding sites for companies already curated into the
 * batch someone is working. Anything outside it goes through /app/leads.
 *
 *   curl -sX POST https://growth-red.vercel.app/api/lab/pregen-builds \
 *     -H "authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' \
 *     -d '{"domains":["venturebnb.com"],"apply":true}'
 *
 * `apply` defaults to false: the call resolves and reports what it would do,
 * and asks WanderOS for nothing.
 */

const BodySchema = z.object({
  // Ten is a batch someone is watching. More than that wants the script.
  domains: z.array(z.string().trim().min(3)).min(1).max(10),
  apply: z.boolean().default(false),
});

export async function POST(request: Request) {
  const denied = await assertLabAccess(request);
  if (denied) return denied;

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { apply } = parsed.data;
  const domains = [
    ...new Set(parsed.data.domains.map((d) => d.toLowerCase())),
  ];

  if (apply && !isWanderApiConfigured) {
    return NextResponse.json(
      { error: "WANDER_API_URL and WANDER_API_KEY are not both set" },
      { status: 412 },
    );
  }

  const rows = await db
    .select()
    .from(leadDomainTable)
    .where(
      and(
        inArray(leadDomainTable.domain, domains),
        eq(leadDomainTable.pregenBatch, CURRENT_PREGEN_BATCH),
        eq(leadDomainTable.excludeFromOutreach, false),
        isNull(leadDomainTable.deletedAt),
      ),
    );
  const byDomain = new Map(rows.map((row) => [row.domain, row]));

  const results = [];
  for (const domain of domains) {
    const row = byDomain.get(domain);
    if (!row) {
      results.push({
        domain,
        action: "skipped",
        reason: `Not in ${CURRENT_PREGEN_BATCH}, or excluded from outreach`,
      });
      continue;
    }

    const inFlight = await db.query.pregenBuildTable.findFirst({
      where: and(
        eq(pregenBuildTable.domainId, row.id),
        isNull(pregenBuildTable.settledAt),
      ),
    });
    if (inFlight) {
      results.push({
        domain,
        action: "skipped",
        reason: `Build already in flight (${inFlight.status ?? "requested"})`,
        prospectId: inFlight.prospectId,
      });
      continue;
    }

    if (!apply) {
      results.push({ domain, action: "would-request" });
      continue;
    }

    const sourceUrl = `https://${row.domain}`;
    try {
      const prospect = await createWebsiteProspect({
        businessName: row.companyName ?? row.domain,
        sourceUrl,
      });
      // WanderOS is idempotent per source URL, so a repeat hands back the same
      // prospect and the unique index is the real serialization point.
      const [build] = await db
        .insert(pregenBuildTable)
        .values({
          domainId: row.id,
          domain: row.domain,
          prospectId: prospect.id,
          websiteId: prospect.websiteId,
          previewToken: prospect.previewToken ?? null,
          businessName: row.companyName ?? row.domain,
          sourceUrl,
          status: prospect.status,
          previewUrl: prospect.previewUrl ?? null,
        })
        .onConflictDoNothing({ target: pregenBuildTable.prospectId })
        .returning();
      // `returning()` after `onConflictDoNothing` comes back empty on the Neon
      // HTTP driver whether or not the row was written, so re-read rather than
      // report a successful request as having produced no build.
      const [stored] = build
        ? [build]
        : await db
            .select()
            .from(pregenBuildTable)
            .where(eq(pregenBuildTable.prospectId, prospect.id))
            .limit(1);
      results.push({
        domain,
        action: "requested",
        prospectId: prospect.id,
        websiteId: prospect.websiteId,
        status: prospect.status,
        buildId: stored?.id ?? null,
        previewUrl: stored?.previewUrl ?? prospect.previewUrl ?? null,
      });
    } catch (error) {
      results.push({
        domain,
        action: "failed",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return NextResponse.json({
    batch: CURRENT_PREGEN_BATCH,
    mode: apply ? "apply" : "dry",
    results,
  });
}
