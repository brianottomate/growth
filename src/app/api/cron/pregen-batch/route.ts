import { NextResponse, type NextRequest } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";

import { env } from "@/env";
import { CURRENT_PREGEN_BATCH } from "@/lib/pregen-batch";
import { db } from "@/server/db";
import { leadChannelTable, leadDomainTable } from "@/server/db/leads-schema";
import { captureAndPersistChannels } from "@/server/services/channel-discovery.service";
import { rankLeadDomain } from "@/server/services/lead-ranker.service";
import { generateAndStoreSequence } from "@/server/services/pregen/generate-sequence";
import { PregenPreconditionError } from "@/server/services/pregen-hubspot-outreach.service";

/**
 * Bring one pre-gen batch up to a complete state: ranked, reachable, drafted.
 *
 * Each pass already exists as a per-row button in `/app/leads`, which is the
 * right shape for a card someone is looking at and the wrong shape for ten. The
 * work also outlives whoever asked for it — a rank is an LLM call, a channel
 * capture is a crawl, a draft is a long generation — so it runs here rather
 * than from a laptop that gets closed.
 *
 * Authenticated by header token, deliberately NOT by a mintable session. A
 * prod endpoint that hands out a browser session in exchange for a secret is an
 * account-takeover primitive if that secret ever leaks; this can only do the
 * three things below, so a leaked token buys an attacker "Wander enriches its
 * own leads", not the contact table. The open /api/test/* routes that leaked
 * lead PII are why that distinction is drawn this way.
 *
 * Idempotent and re-runnable: every pass is skipped when its output already
 * exists, so repeated calls converge and then do nothing. Bounded twice over,
 * by `limit` and by a wall-clock deadline inside the function budget, because
 * the passes are slow and unevenly slow.
 *
 *   curl -H "Authorization: Bearer $ADMIN_TOKEN" \
 *     "https://growth-red.vercel.app/api/cron/pregen-batch?batch=pregen-2&limit=4"
 */
export const maxDuration = 300;

/**
 * Stop STARTING domains here. One domain costs ~65s across its three passes, so
 * a deadline close to the 300s budget lets a domain start at 239s and get the
 * whole function killed at 300s with nothing serialized — which is exactly what
 * happened on the first run. The gap has to be wider than the slowest domain,
 * not wider than a rounding error.
 *
 * Prefer `?domain=` and fan out instead: the passes are independent per domain,
 * so ten concurrent invocations finish in the time one domain takes rather than
 * ten times that.
 */
const DEADLINE_MS = 180_000;

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && bearer === cronSecret) return true;
  return bearer === env.ADMIN_TOKEN;
}

function intParam(request: NextRequest, key: string, fallback: number): number {
  const raw = request.nextUrl.searchParams.get(key);
  const parsed = raw == null ? NaN : Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function handle(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const batch =
    request.nextUrl.searchParams.get("batch")?.trim() || CURRENT_PREGEN_BATCH;
  const limit = intParam(request, "limit", 10);
  // Narrow to one domain so callers can fan out: the passes share no state
  // across domains, so N invocations of one domain each cost what the slowest
  // single domain costs, instead of the sum.
  const only = request.nextUrl.searchParams.get("domain")?.trim().toLowerCase();

  const rows = await db
    .select({
      id: leadDomainTable.id,
      domain: leadDomainTable.domain,
      companyName: leadDomainTable.companyName,
      pregenSiteUrl: leadDomainTable.pregenSiteUrl,
      excludeFromOutreach: leadDomainTable.excludeFromOutreach,
      hasRank: sql<boolean>`${leadDomainTable.enrichment} ? 'leadRank'`,
      channels: sql<number>`(
        select count(*)::int from ${leadChannelTable}
        where ${leadChannelTable.domainId} = ${leadDomainTable.id}
      )`,
      drafts: sql<number>`(
        select count(*)::int from leads.sequence as s
        where s.domain_id = ${leadDomainTable.id} and s.status = 'draft'
      )`,
    })
    .from(leadDomainTable)
    .where(
      and(
        eq(leadDomainTable.pregenBatch, batch),
        isNull(leadDomainTable.deletedAt),
        ...(only ? [eq(leadDomainTable.domain, only)] : []),
      ),
    )
    .limit(only ? 1 : limit);

  const results: Record<string, unknown>[] = [];
  let ranOut = false;

  for (const row of rows) {
    if (Date.now() - startedAt > DEADLINE_MS) {
      ranOut = true;
      break;
    }

    const outcome: Record<string, unknown> = { domain: row.domain };

    if (row.hasRank) {
      outcome.rank = "already ranked";
    } else {
      try {
        const ranked = await rankLeadDomain(row.domain, { persist: true });
        outcome.rank = ranked.overall;
      } catch (error) {
        outcome.rank = { error: reason(error) };
      }
    }

    if (row.channels > 0) {
      outcome.channels = `already captured (${row.channels})`;
    } else {
      try {
        const { channels } = await captureAndPersistChannels({
          domainId: row.id,
          domain: row.domain,
          companyName: row.companyName,
        });
        outcome.channels = channels.length;
      } catch (error) {
        outcome.channels = { error: reason(error) };
      }
    }

    // A draft needs a preview that resolves. The webhook writes pregenSiteUrl on
    // READY and clears it on FAILED, so its absence here means the build did not
    // produce anything to write copy about — not a fault worth retrying.
    if (row.drafts > 0) {
      outcome.sequence = "already drafted";
    } else if (row.excludeFromOutreach) {
      outcome.sequence = "excluded from outreach";
    } else if (!row.pregenSiteUrl) {
      outcome.sequence = "no preview (build failed or never ran)";
    } else {
      try {
        const created = await generateAndStoreSequence(row.id);
        outcome.sequence = { id: created.id, angle: created.angle };
      } catch (error) {
        outcome.sequence =
          error instanceof PregenPreconditionError
            ? { refused: error.message }
            : { error: reason(error) };
      }
    }

    results.push(outcome);
  }

  return NextResponse.json({
    batch,
    considered: rows.length,
    processed: results.length,
    // True when the deadline stopped the loop early: call again to continue,
    // since every pass above is skip-if-done.
    incomplete: ranOut,
    elapsedMs: Date.now() - startedAt,
    results,
  });
}

export const GET = handle;
export const POST = handle;
