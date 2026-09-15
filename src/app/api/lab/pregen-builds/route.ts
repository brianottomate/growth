import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  createWebsiteProspect,
  isWanderApiConfigured,
  listWebsiteProspects,
  retryWebsiteProspect,
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
 * Buildable set is the same bound the send route uses: in `leads`, not excluded
 * from outreach, not deleted. It was the current batch until 2026-08-20, which
 * put the harder gate on the cheaper action — a build emails nobody, while
 * `pregen-send` enrols a prospect and mails them from Kyle's inbox on the same
 * token with no batch check at all. Scoping builds to a curated list bought no
 * safety a leaked ADMIN_TOKEN could not route around, and cost real work: an
 * off-batch domain could only be built by editing the HubSpot list a teammate
 * curates or by writing `pregen_batch` straight into prod.
 *
 * What still bounds this: the ten-domain cap, `excludeFromOutreach`, and the
 * in-flight check below. A build is reversible and silent; it is the send that
 * needs the narrow gate.
 *
 *   curl -sX POST https://growth-red.vercel.app/api/lab/pregen-builds \
 *     -H "authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' \
 *     -d '{"domains":["venturebnb.com"],"apply":true}'
 *
 * `apply` defaults to false: the call resolves and reports what it would do,
 * and asks WanderOS for nothing.
 *
 * `retry: true` re-runs a build that FAILED instead of requesting a new one.
 * That path deliberately ignores the batch scope, because "has a failed build"
 * is a tighter bound than the batch is: it can only re-run work somebody
 * already asked for, and WanderOS keeps the same prospect id.
 */

const BodySchema = z.object({
  // Ten is a batch someone is watching. More than that wants the script.
  domains: z.array(z.string().trim().min(3)).min(1).max(10),
  apply: z.boolean().default(false),
  retry: z.boolean().default(false),
  /**
   * Read what WanderOS itself says about these prospects, without writing
   * anything. The webhook is the only delivery path and has no reconcile sweep
   * behind it, so a build stuck GENERATING in our table is ambiguous: the
   * workflow may be wedged, or it may have settled into an event we dropped.
   * This is what tells those apart.
   */
  status: z.boolean().default(false),
  /**
   * Retry a build whose latest status is not FAILED.
   *
   * `createWebsiteProspect` 409s on a source URL it has already seen, so retry is the only
   * rebuild path there is, and the FAILED guard below makes a READY prospect unrebuildable —
   * which is exactly what you want to do after fixing image selection. WanderOS still decides:
   * this only stops Growth refusing on its behalf.
   */
  force: z.boolean().default(false),
});

async function retryFailed(domains: string[], apply: boolean, force = false) {
  const results = [];
  for (const domain of domains) {
    const [build] = await db
      .select()
      .from(pregenBuildTable)
      .where(eq(pregenBuildTable.domain, domain))
      .orderBy(desc(pregenBuildTable.requestedAt))
      .limit(1);

    if (!build?.prospectId) {
      results.push({ domain, action: "skipped", reason: "No build on record" });
      continue;
    }
    if (build.status !== "FAILED" && !force) {
      results.push({
        domain,
        action: "skipped",
        reason: `Latest build is ${build.status ?? "unknown"}, not FAILED`,
      });
      continue;
    }
    if (!apply) {
      results.push({
        domain,
        action: "would-retry",
        prospectId: build.prospectId,
        failedWith: build.errorMessage,
      });
      continue;
    }

    try {
      const prospect = await retryWebsiteProspect(build.prospectId);
      // Reopen the row in the same shape a fresh request leaves it, or the
      // build stays absent from `pregenBuildsInFlight` and reads as still
      // failed until a webhook happens to land on it.
      await db
        .update(pregenBuildTable)
        .set({
          status: prospect.status,
          previewUrl: prospect.previewUrl ?? build.previewUrl,
          websiteId: prospect.websiteId ?? build.websiteId,
          errorMessage: null,
          settledAt: null,
          requestedAt: new Date(),
        })
        .where(eq(pregenBuildTable.id, build.id));
      results.push({
        domain,
        action: "retried",
        prospectId: build.prospectId,
        status: prospect.status,
        previouslyFailedWith: build.errorMessage,
      });
    } catch (error) {
      results.push({
        domain,
        action: "failed",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}

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
  const { apply, retry } = parsed.data;
  const domains = [...new Set(parsed.data.domains.map((d) => d.toLowerCase()))];

  if (apply && !isWanderApiConfigured) {
    return NextResponse.json(
      { error: "WANDER_API_URL and WANDER_API_KEY are not both set" },
      { status: 412 },
    );
  }

  if (parsed.data.status) {
    const { prospects } = await listWebsiteProspects({ take: 100 });
    const builds = await db
      .select({
        domain: pregenBuildTable.domain,
        prospectId: pregenBuildTable.prospectId,
        ours: pregenBuildTable.status,
        requestedAt: pregenBuildTable.requestedAt,
      })
      .from(pregenBuildTable)
      .where(inArray(pregenBuildTable.domain, domains));
    return NextResponse.json({
      action: "status",
      results: builds.map((build) => {
        const theirs = prospects.find((p) => p.id === build.prospectId);
        return {
          domain: build.domain,
          prospectId: build.prospectId,
          ourStatus: build.ours,
          theirStatus: theirs?.status ?? "(not listed)",
          theirError: theirs?.errorMessage ?? null,
          minutes: Math.round(
            (Date.now() - build.requestedAt.getTime()) / 60000,
          ),
        };
      }),
    });
  }

  if (retry) {
    return NextResponse.json({
      mode: apply ? "apply" : "dry",
      action: "retry",
      results: await retryFailed(domains, apply, parsed.data.force),
    });
  }

  const rows = await db
    .select()
    .from(leadDomainTable)
    .where(
      and(
        inArray(leadDomainTable.domain, domains),
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
        reason: "Not in leads, or excluded from outreach",
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
    mode: apply ? "apply" : "dry",
    results,
  });
}
