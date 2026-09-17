import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import { db } from "@/server/db";
import {
  type FunnelStage,
  funnelSendLogTable,
  funnelStateTable,
} from "@/server/db/funnel-schema";
import { processLead } from "@/server/services/sync.service";

// =====================================================
// Funnel abandonment sweep — the detection brain
//
// Replaces CIO's "enter → delay → did they order? → sync" workflow model
// with a declarative query over funnel_state: the delay is a WHERE clause
// on the stage timestamp, and "did they complete?" is a comparison against
// the deeper-stage timestamps. Runs every ~20 minutes; funnel_send_log's
// unique (user, stage, windowKey) is the idempotency ledger, so re-runs
// never double-fire an episode.
//
// dryRun (the default posture until Phase 2 flips a stage live) records
// what WOULD fire — rows land in funnel_send_log with syncStatus
// "dry_run", giving reviewable candidate lists and counts with zero sends.
// =====================================================

interface StageDefinition {
  stage: FunnelStage;
  /** SQL expression for the timestamp that anchors this stage's episode. */
  anchor: ReturnType<typeof sql<string>>;
  /** Full WHERE predicate: window + not-progressed-deeper. */
  where: ReturnType<typeof sql>;
}

const t = funnelStateTable;

// Deeper-stage exits share a shape: the exit event either never happened
// or happened before the anchor (i.e. an older, unrelated episode).
const notAfter = (exit: AnyPgColumn, anchor: ReturnType<typeof sql>) =>
  sql`(${exit} IS NULL OR ${exit} < ${anchor})`;

function stageDefinitions(): StageDefinition[] {
  const searchAnchor = sql<string>`${t.lastSearchTs}`;
  const wishlistAnchor = sql<string>`${t.lastWishlistTs}`;
  // Cart is anchored on the deepest of preview/started — Checkout Previewed
  // captures the auth-wall/price-shock bouncers Checkout Started never sees.
  const cartAnchor = sql<string>`GREATEST(COALESCE(${t.lastCheckoutTs}, '-infinity'::timestamptz), COALESCE(${t.lastCheckoutPreviewTs}, '-infinity'::timestamptz))`;
  const paymentAnchor = sql<string>`GREATEST(COALESCE(${t.lastPaymentTs}, '-infinity'::timestamptz), COALESCE(${t.lastPaymentSubmitTs}, '-infinity'::timestamptz))`;

  return [
    {
      stage: "abandoned_search",
      anchor: searchAnchor,
      where: sql`
        ${t.lastSearchTs} BETWEEN now() - interval '7 days' AND now() - interval '1 hour'
        AND ${notAfter(t.lastReserveClickTs, searchAnchor)}
        AND ${notAfter(t.lastCheckoutPreviewTs, searchAnchor)}
        AND ${notAfter(t.lastCheckoutTs, searchAnchor)}
        AND ${notAfter(t.lastPaymentTs, searchAnchor)}
        AND ${notAfter(t.lastPaymentSubmitTs, searchAnchor)}
        AND ${notAfter(t.lastPurchaseTs, searchAnchor)}
      `,
    },
    {
      stage: "abandoned_wishlist",
      anchor: wishlistAnchor,
      // Searching after wishlisting doesn't exit the stage — only moving
      // deeper (toward checkout) does.
      where: sql`
        ${t.lastWishlistTs} BETWEEN now() - interval '7 days' AND now() - interval '1 hour'
        AND ${notAfter(t.lastCheckoutPreviewTs, wishlistAnchor)}
        AND ${notAfter(t.lastCheckoutTs, wishlistAnchor)}
        AND ${notAfter(t.lastPaymentTs, wishlistAnchor)}
        AND ${notAfter(t.lastPaymentSubmitTs, wishlistAnchor)}
        AND ${notAfter(t.lastPurchaseTs, wishlistAnchor)}
      `,
    },
    {
      stage: "abandoned_cart",
      anchor: cartAnchor,
      where: sql`
        ${cartAnchor} BETWEEN now() - interval '7 days' AND now() - interval '1 hour'
        AND ${notAfter(t.lastPaymentTs, cartAnchor)}
        AND ${notAfter(t.lastPaymentSubmitTs, cartAnchor)}
        AND ${notAfter(t.lastPurchaseTs, cartAnchor)}
      `,
    },
    {
      // Hottest stage, shortest delay: someone at the till 30+ minutes ago
      // with no purchase since. 48h window — after that it's cold.
      stage: "abandoned_payment",
      anchor: paymentAnchor,
      where: sql`
        ${paymentAnchor} BETWEEN now() - interval '48 hours' AND now() - interval '30 minutes'
        AND ${notAfter(t.lastPurchaseTs, paymentAnchor)}
      `,
    },
  ];
}

interface StageCandidate {
  userId: string;
  email: string | null;
  windowKey: string;
  destination: string | null;
  searchCheckin: string | null;
  searchCheckout: string | null;
  searchCount: number;
  lastSearchTs: Date | null;
  checkoutCheckin: string | null;
  checkoutCheckout: string | null;
  propertyName: string | null;
}

/** Per-stage webhook payload for processLead — the personalization BDRs see. */
function buildEventData(
  stage: FunnelStage,
  c: StageCandidate,
): Record<string, unknown> {
  const base = { source_workflow: "funnel_abandonment_sweep" };
  if (stage === "abandoned_search") {
    return {
      ...base,
      search_destination: c.destination ?? undefined,
      checkin: c.searchCheckin ?? undefined,
      checkout: c.searchCheckout ?? undefined,
      search_count: c.searchCount,
      last_search_date: c.lastSearchTs?.toISOString(),
    };
  }
  if (stage === "abandoned_wishlist") {
    return { ...base, property_name: c.propertyName ?? undefined };
  }
  // cart + payment: checkout context
  return {
    ...base,
    property_name: c.propertyName ?? undefined,
    checkin: c.checkoutCheckin ?? undefined,
    checkout: c.checkoutCheckout ?? undefined,
  };
}

export interface StageSweepResult {
  stage: FunnelStage;
  /** Users matching the stage predicate right now. */
  eligible: number;
  /** Eligible but unsendable until the email backfill heals them. */
  missingEmail: number;
  /** New episodes this run (send_log insert won) — what would/did fire. */
  newEpisodes: number;
  synced: number;
  failed: number;
  /**
   * HubSpot half of the sync. A HubSpot failure does not fail the episode
   * while Outreach is configured, so `synced` alone cannot show a dark
   * HubSpot — these can.
   */
  hubspotWritten: number;
  hubspotFailed: number;
}

export interface FunnelSweepResult {
  startedAt: string;
  completedAt: string;
  durationMs: number;
  dryRun: boolean;
  stages: StageSweepResult[];
}

export async function runFunnelAbandonmentSweep(options: {
  dryRun?: boolean;
  /** Max NEW episodes to act on per stage per run (live mode safety cap). */
  limitPerStage?: number;
  concurrency?: number;
}): Promise<FunnelSweepResult> {
  const dryRun = options.dryRun ?? true;
  const limitPerStage = options.limitPerStage ?? (dryRun ? 1000 : 50);
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 4, 10));
  const startedAt = new Date();

  const results: StageSweepResult[] = [];

  for (const def of stageDefinitions()) {
    const rows = await db
      .select({
        userId: t.userId,
        email: t.email,
        windowKey: def.anchor,
        destination: t.lastSearchDestination,
        searchCheckin: t.lastSearchCheckin,
        searchCheckout: t.lastSearchCheckout,
        searchCount: t.searchCount,
        lastSearchTs: t.lastSearchTs,
        checkoutCheckin: sql<
          string | null
        >`COALESCE(${t.lastCheckoutCheckin}, ${t.lastCheckoutPreviewCheckin})`,
        checkoutCheckout: sql<
          string | null
        >`COALESCE(${t.lastCheckoutCheckout}, ${t.lastCheckoutPreviewCheckout})`,
        propertyName: sql<
          string | null
        >`COALESCE(${t.lastCheckoutProperty}, ${t.lastCheckoutPreviewProperty}, ${t.lastWishlistProperty})`,
      })
      .from(t)
      .where(def.where);

    const candidates: StageCandidate[] = rows.map((r) => ({
      ...r,
      windowKey: new Date(r.windowKey).toISOString(),
    }));
    const emailable = candidates.filter((c) => !!c.email);
    const missingEmail = candidates.length - emailable.length;

    // The ledger only tracks sendable candidates: an insert that wins the
    // unique (user, stage, windowKey) race IS the new episode. Email-less
    // users are counted but not logged — once the email backfill heals
    // them, a later sweep picks the same episode up as new.
    let newEpisodes: Array<{ id: string; userId: string; email: string }> = [];
    if (emailable.length > 0) {
      newEpisodes = await db
        .insert(funnelSendLogTable)
        .values(
          emailable.map((c) => ({
            userId: c.userId,
            email: c.email!,
            stage: def.stage,
            windowKey: c.windowKey,
            source: "sweep",
            syncStatus: dryRun ? "dry_run" : "pending",
          })),
        )
        .onConflictDoNothing()
        .returning({
          id: funnelSendLogTable.id,
          userId: funnelSendLogTable.userId,
          email: funnelSendLogTable.email,
        });
    }

    // Process from the PENDING queue, not just this run's fresh inserts —
    // otherwise episodes ledgered beyond the per-run cap are orphaned as
    // pending forever (their re-inserts conflict and never return).
    const toProcess = dryRun
      ? []
      : await db
          .select({
            id: funnelSendLogTable.id,
            userId: funnelSendLogTable.userId,
            email: funnelSendLogTable.email,
          })
          .from(funnelSendLogTable)
          .where(
            and(
              eq(funnelSendLogTable.stage, def.stage),
              eq(funnelSendLogTable.syncStatus, "pending"),
            ),
          )
          .orderBy(asc(funnelSendLogTable.sentAt))
          .limit(limitPerStage);

    let synced = 0;
    let failed = 0;
    let hubspotWritten = 0;
    let hubspotFailed = 0;

    if (!dryRun && toProcess.length > 0) {
      const byUserId = new Map(emailable.map((c) => [c.userId, c]));
      let index = 0;
      const workers = Array.from({ length: concurrency }, async () => {
        while (true) {
          const current = index++;
          if (current >= toProcess.length) return;
          const episode = toProcess[current]!;
          const candidate = byUserId.get(episode.userId);
          try {
            const result = await processLead({
              email: episode.email,
              eventType: def.stage,
              eventData: candidate
                ? buildEventData(def.stage, candidate)
                : { source_workflow: "funnel_abandonment_sweep" },
            });
            const ok = result.status === "success";
            if (ok) {
              synced++;
            } else {
              failed++;
            }
            if (result.hubspotAction) hubspotWritten++;
            if (result.hubspotError) hubspotFailed++;
            await db
              .update(funnelSendLogTable)
              .set({
                syncStatus: ok ? "synced" : result.status,
                error: result.error ?? null,
              })
              .where(sql`${funnelSendLogTable.id} = ${episode.id}`);
          } catch (error) {
            failed++;
            await db
              .update(funnelSendLogTable)
              .set({
                syncStatus: "failed",
                error: error instanceof Error ? error.message : String(error),
              })
              .where(sql`${funnelSendLogTable.id} = ${episode.id}`);
          }
        }
      });
      await Promise.all(workers);
    }

    console.log(
      `🔎 [FunnelSweep] ${def.stage}: eligible=${candidates.length} missingEmail=${missingEmail} newEpisodes=${newEpisodes.length}${dryRun ? " (dry run)" : ` synced=${synced} failed=${failed} hubspot=${hubspotWritten}/${hubspotFailed} (written/failed)`}`,
    );

    results.push({
      stage: def.stage,
      eligible: candidates.length,
      missingEmail,
      newEpisodes: newEpisodes.length,
      synced,
      failed,
      hubspotWritten,
      hubspotFailed,
    });
  }

  const completedAt = new Date();
  return {
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime(),
    dryRun,
    stages: results,
  };
}
