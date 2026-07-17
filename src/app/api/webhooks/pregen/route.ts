/**
 * Monolith → growth pregen lifecycle webhook (WOS-4563 spike).
 *
 * The wander monolith POSTs prospect.updated events here when a pregenerated
 * marketing site finishes enriching (READY) or fails (build error / eval gate).
 * We write the result onto the lead_domain spine so /leads shows preview URLs
 * and pregen status without polling the monolith.
 *
 * Auth: shared secret in the x-pregen-secret header (PREGEN_WEBHOOK_SECRET on
 * both sides). Delivery is at-least-once from the monolith's perspective and
 * the write is an idempotent upsert, so replays are harmless.
 */

import { type NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { env } from "@/env";
import { db } from "@/server/db";
import { leadDomainTable } from "@/server/db/schema";

const payloadSchema = z.object({
  event: z.literal("prospect.updated"),
  prospectId: z.string(),
  websiteId: z.string(),
  businessName: z.string(),
  sourceUrl: z.string().url(),
  status: z.string(),
  previewUrl: z.string().url().optional(),
  evalOverall: z.number().optional(),
  errorMessage: z.string().optional(),
  occurredAt: z.string(),
});

/** Mirror of the canonical normalizer: lowercased host, no scheme/www. */
function normalizeDomain(sourceUrl: string): string {
  const host = new URL(sourceUrl).hostname.toLowerCase();
  return host.startsWith("www.") ? host.slice(4) : host;
}

function isAuthorized(request: NextRequest): boolean {
  const secret = env.PREGEN_WEBHOOK_SECRET;
  if (!secret) return false;
  const provided = request.headers.get("x-pregen-secret") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = payloadSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const p = parsed.data;
  const domain = normalizeDomain(p.sourceUrl);

  const pregenEnrichment = {
    prospectId: p.prospectId,
    websiteId: p.websiteId,
    status: p.status,
    evalOverall: p.evalOverall ?? null,
    errorMessage: p.errorMessage ?? null,
    occurredAt: p.occurredAt,
  };

  const existing = await db.query.leadDomainTable.findFirst({
    where: eq(leadDomainTable.domain, domain),
    columns: { id: true },
  });

  if (existing) {
    await db
      .update(leadDomainTable)
      .set({
        pregenStatus: p.status,
        ...(p.previewUrl ? { pregenSiteUrl: p.previewUrl } : {}),
        inPregen: true,
        enrichment: sql`coalesce(${leadDomainTable.enrichment}, '{}'::jsonb) || ${JSON.stringify({ pregen: pregenEnrichment })}::jsonb`,
      })
      .where(eq(leadDomainTable.id, existing.id));
  } else {
    // Prospect created outside the leads pipeline (manual run) — create the spine row
    // so the result is visible in /leads either way.
    await db.insert(leadDomainTable).values({
      domain,
      companyName: p.businessName,
      pregenStatus: p.status,
      pregenSiteUrl: p.previewUrl,
      inPregen: true,
      enrichment: { pregen: pregenEnrichment },
    });
  }

  console.log(
    `📥 [PregenWebhook] ${domain} → ${p.status}${p.evalOverall != null ? ` (eval ${p.evalOverall})` : ""}`,
  );
  return NextResponse.json({ ok: true, domain, action: existing ? "updated" : "created" });
}

/** Health check */
export function GET() {
  return NextResponse.json({ status: "ok", service: "pregen-webhook" });
}
