import { and, asc, eq, isNull, lte, notExists, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/env";
import { db } from "@/server/db";
import {
  leadDomainTable,
  leadSequenceTable,
  pregenBuildTable,
} from "@/server/db/leads-schema";
import { enrolPregenDomains } from "@/server/services/pregen-send.service";

/**
 * Drain the pregen send queue — daily via vercel.json at 15:00 UTC (8am
 * Pacific in summer; the schedule is UTC-fixed, so it drifts to 7am PST in
 * winter, which is fine for a morning send).
 *
 * The queue is `pregen_build.send_scheduled_for`, day granularity: an operator
 * reviews a batch whenever and stamps the day each domain should go out; this
 * cron enrols whatever is due through the same guarded mutation as every other
 * send. At most ten per run — the wave size a human watches — with the rest
 * picked up the next morning.
 *
 * Refusals are not retried by this cron beyond falling due again tomorrow, and
 * the one-live-enrolment guard makes an already-sent domain a cheap no-op, so
 * `send_scheduled_for` never needs clearing.
 */

export const maxDuration = 300;

const WAVE_CAP = 10;

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && bearer === cronSecret) return true;
  return bearer === env.ADMIN_TOKEN;
}

async function handle(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  // "Today" by the wall clock the operator scheduled against.
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Los_Angeles",
  });

  const due = await db
    .select({ domain: pregenBuildTable.domain })
    .from(pregenBuildTable)
    .innerJoin(
      leadDomainTable,
      eq(leadDomainTable.id, pregenBuildTable.domainId),
    )
    .where(
      and(
        lte(pregenBuildTable.sendScheduledFor, today),
        eq(pregenBuildTable.status, "READY"),
        eq(leadDomainTable.excludeFromOutreach, false),
        isNull(leadDomainTable.deletedAt),
        // Cheap pre-filter; the mutation re-checks and is the real guard.
        notExists(
          db
            .select({ one: sql`1` })
            .from(leadSequenceTable)
            .where(
              and(
                eq(leadSequenceTable.domainId, pregenBuildTable.domainId),
                sql`${leadSequenceTable.hubspotEnrollmentId} is not null`,
              ),
            ),
        ),
      ),
    )
    .orderBy(asc(pregenBuildTable.sendScheduledFor))
    .limit(WAVE_CAP);

  if (!due.length) {
    return NextResponse.json({ success: true, due: 0, results: [] });
  }

  const results = await enrolPregenDomains(
    due.map((row) => row.domain),
    {
      apply: true,
      actor: { id: "cron-pregen-send-queue", email: "growth-cron@wander.com" },
    },
  );

  console.log(
    `[pregen send queue] ${results.filter((r) => r.action === "enrolled").length}/${due.length} enrolled`,
    results,
  );
  return NextResponse.json({ success: true, due: due.length, results });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
