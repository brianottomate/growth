import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";

import { env } from "@/env";
import { db } from "@/server/db";
import { leadDomainTable, pregenBuildTable } from "@/server/db/leads-schema";

/**
 * WanderOS pregen prospect webhook.
 *
 * WanderOS pushes build lifecycle events here (wandercom/wander#20939,
 * `notify-prospect-webhook.ts`) so /leads learns about previews without polling.
 * Delivery is deliberately fire-and-forget on their side: a 5s timeout, and a
 * non-OK response is logged and dropped. There is no retry rail and no
 * reconcile loop by design — the recovery path is the on-demand refresh action
 * on the prospect, not a background sweep.
 *
 * That makes two things load-bearing here:
 *  - Answer fast and answer 200 on anything we understood, so a slow write
 *    never costs us the only delivery we get.
 *  - Apply out of order safely. `occurredAt` is compared against the stored
 *    `lastEventAt` so a late "building" cannot overwrite a newer "ready".
 */

const ProspectWebhookPayload = z.object({
  event: z.literal("prospect.updated"),
  prospectId: z.string().min(1),
  websiteId: z.string().min(1),
  businessName: z.string(),
  sourceUrl: z.string(),
  status: z.string().min(1),
  previewUrl: z.string().optional(),
  evalOverall: z.number().optional(),
  errorMessage: z.string().optional(),
  occurredAt: z.string(),
});

/** Statuses that mean the build stopped moving, either way. */
const SETTLED = new Set(["ready", "failed", "error", "expired", "cancelled"]);

function secretMatches(provided: string | null): boolean {
  const expected = env.PREGEN_WEBHOOK_SECRET;
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch, which is itself a signal.
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * `https://www.example.com/x` → `example.com`, to match how leads are keyed.
 *
 * Exported for test: this is the join between WanderOS's `sourceUrl` and
 * `lead_domain.domain`, and it is the only correlation available on the first
 * event for a prospect we did not request ourselves. Getting `www` or a path
 * wrong means the webhook silently reports `matched: false` forever.
 */
export function hostFromUrl(value: string): string | null {
  try {
    return new URL(value).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  if (!env.PREGEN_WEBHOOK_SECRET) {
    // Unconfigured is not "reject quietly": if WanderOS starts sending before
    // the secret is set, a 503 is visible in their logs as a delivery failure.
    return NextResponse.json(
      { error: "Pregen webhook is not configured" },
      { status: 503 },
    );
  }
  if (!secretMatches(request.headers.get("x-pregen-secret"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const parsed = ProspectWebhookPayload.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Unrecognised payload", detail: parsed.error.issues },
      { status: 400 },
    );
  }
  const payload = parsed.data;
  const occurredAt = new Date(payload.occurredAt);

  // Correlate on prospectId first — it is the identity WanderOS assigned and
  // survives a domain being renamed or re-imported. sourceUrl is the fallback
  // for the very first event, before we have stored an id.
  const existing = await db.query.pregenBuildTable.findFirst({
    where: eq(pregenBuildTable.prospectId, payload.prospectId),
  });

  let domainId = existing?.domainId ?? null;
  if (!domainId) {
    const host = hostFromUrl(payload.sourceUrl);
    if (host) {
      const lead = await db.query.leadDomainTable.findFirst({
        where: and(eq(leadDomainTable.domain, host), isNull(leadDomainTable.deletedAt)),
        columns: { id: true },
      });
      domainId = lead?.id ?? null;
    }
  }

  if (!domainId) {
    // 200, not 404: this is a real event for a prospect we do not track, and
    // making WanderOS log a delivery failure for it would be noise.
    return NextResponse.json({ ok: true, matched: false });
  }

  const stale =
    existing?.lastEventAt != null && existing.lastEventAt > occurredAt;
  const settled = SETTLED.has(payload.status.toLowerCase());

  if (existing) {
    if (stale) return NextResponse.json({ ok: true, stale: true });
    await db
      .update(pregenBuildTable)
      .set({
        websiteId: payload.websiteId,
        status: payload.status,
        previewUrl: payload.previewUrl ?? existing.previewUrl,
        evalOverall: payload.evalOverall ?? existing.evalOverall,
        errorMessage: payload.errorMessage ?? null,
        lastEventAt: occurredAt,
        settledAt: settled ? occurredAt : existing.settledAt,
      })
      .where(eq(pregenBuildTable.id, existing.id));
  } else {
    await db.insert(pregenBuildTable).values({
      domainId,
      domain: hostFromUrl(payload.sourceUrl) ?? payload.sourceUrl,
      prospectId: payload.prospectId,
      websiteId: payload.websiteId,
      businessName: payload.businessName,
      sourceUrl: payload.sourceUrl,
      status: payload.status,
      previewUrl: payload.previewUrl ?? null,
      evalOverall: payload.evalOverall ?? null,
      errorMessage: payload.errorMessage ?? null,
      lastEventAt: occurredAt,
      settledAt: settled ? occurredAt : null,
    });
  }

  // Promote the preview onto the lead itself. This is the field the copy
  // generator grounds on, the reachability probe checks, the review card links
  // and the publish guard requires — so nothing downstream needs to know the
  // build table exists.
  if (payload.previewUrl && !stale) {
    await db
      .update(leadDomainTable)
      .set({ pregenSiteUrl: payload.previewUrl })
      .where(
        and(
          eq(leadDomainTable.id, domainId),
          // Never clobber a newer preview with a late event for an older build.
          or(
            isNull(leadDomainTable.pregenSiteUrl),
            eq(leadDomainTable.pregenSiteUrl, payload.previewUrl),
            eq(leadDomainTable.pregenSiteUrl, ""),
          ),
        ),
      );
  }

  return NextResponse.json({ ok: true, matched: true, settled });
}
