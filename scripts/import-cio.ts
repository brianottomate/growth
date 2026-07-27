/**
 * Import Customer.io (Wander workspace) into the growth DB — the strategic-layer
 * mirror. Read-only against CIO (App API, CUSTOMER_IO_APP_KEY); idempotent on
 * our side (wipes prior CIO-sourced rows for the brand, re-inserts).
 *
 *   bun run scripts/import-cio.ts
 *
 * Maps:
 *   - newsletters (= UI "Broadcasts")  → platform_post (newsletter, externalKind=broadcast)
 *   - campaigns (journeys)             → lifecycle_campaign (+ touchpoints from actions)
 *   - transactional messages           → lifecycle_campaign (kind=transactional)
 * Scope: 2026 only. Draft cleanup is heuristically flagged (review/candidate).
 */
import { and, eq } from "drizzle-orm";

import { env } from "@/env";
import { db } from "@/server/db";
import {
  brandTable,
  channelTable,
  lifecycleCampaignTable,
  lifecycleTouchpointTable,
  organizationTable,
  platformPostTable,
} from "@/server/db/schema";
import type {
  LifecycleKind,
  LifecycleRunState,
  TouchpointChannel,
} from "@/server/db/schema";
import type { CleanupStatus, PostStats } from "@/server/db/schema";
import { createId } from "@/server/db/utils";

const KEY = env.CUSTOMER_IO_APP_KEY;
const BASE = "https://api.customer.io/v1";
const UI = "https://fly.customer.io/journeys/env/142511";
const Y2026 = Math.floor(Date.parse("2026-01-01T00:00:00Z") / 1000); // 1767225600
const num = (x: unknown) => (typeof x === "number" ? x : Number(x) || 0);

type CioCampaign = {
  id: number;
  name: string;
  type?: string;
  state?: string;
  active?: boolean;
  event_name?: string;
  first_started?: number;
  actions?: { id: number; type: string }[];
};
type CioTransactional = {
  id: number;
  name: string;
  description?: string;
  trigger_name?: string;
};

async function cio<T = Record<string, unknown>>(path: string): Promise<T> {
  const r = await fetch(BASE + path, {
    headers: { Authorization: `Bearer ${KEY}` },
  });
  if (!r.ok) throw new Error(`CIO ${path} → ${r.status}`);
  return (await r.json()) as T;
}

const DUP_RX =
  /\[copy\]|\[opps\]|\[new|\[andy|\[brian|\[lakshya|template|testing|test |option \d|backup|untitled|\bff\b/i;

const cleanupForDraft = (name: string): CleanupStatus =>
  DUP_RX.test(name) ? "candidate" : "review";

function lifecycleKind(name: string, type: string): LifecycleKind {
  const n = name.toLowerCase();
  if (/welcome|onboard/.test(n)) return "onboarding";
  if (/abandon|cart|checkout/.test(n)) return "abandoned_cart";
  if (/winback|reactivat|dormant|re-?engage/.test(n)) return "reactivation";
  if (/revival|revive/.test(n)) return "revival";
  if (type === "transactional") return "transactional";
  if (type === "event" || type === "behavioral") return "behavioral";
  return "other";
}

function runStateFromCampaign(state: string): LifecycleRunState {
  switch (state) {
    case "running":
      return "running";
    case "stopped":
      return "stopped";
    case "draft":
      return "draft";
    case "paused":
      return "paused";
    default:
      return "planned";
  }
}

const TOUCHPOINT_CHANNELS: Record<string, TouchpointChannel> = {
  email: "email",
  push: "push",
  sms: "sms",
  twilio: "sms",
  slack: "slack",
  webhook: "webhook",
};

async function main() {
  const org = await db.query.organizationTable.findFirst({
    where: eq(organizationTable.slug, "wander"),
  });
  if (!org) throw new Error("No 'wander' org — run the seed first.");
  const wander = await db.query.brandTable.findFirst({
    where: and(eq(brandTable.slug, "wander"), eq(brandTable.organizationId, org.id)),
  });
  if (!wander) throw new Error("No 'wander' brand.");
  const dispatch = await db.query.channelTable.findFirst({
    where: and(eq(channelTable.brandId, wander.id), eq(channelTable.kind, "newsletter")),
  });
  console.log(`✓ target: brand=${wander.id} newsletterChannel=${dispatch?.id ?? "—"}`);

  // ---- 1. Newsletters (broadcasts) → platform_post --------------------
  const all: { id: number; name: string; sent_at?: number; created?: number; updated?: number }[] = [];
  let start: string | undefined;
  do {
    const data = await cio<{ newsletters?: typeof all; next?: string }>(
      `/newsletters?limit=100${start ? `&start=${start}` : ""}`,
    );
    all.push(...(data.newsletters ?? []));
    start = data.next;
  } while (start);

  const in2026 = all.filter(
    (n) => num(n.sent_at) >= Y2026 || (!n.sent_at && num(n.updated) >= Y2026),
  );
  const sent2026 = in2026.filter((n) => n.sent_at).sort((a, b) => num(b.sent_at) - num(a.sent_at));
  const drafts2026 = in2026.filter((n) => !n.sent_at);
  // Bound metric calls: enrich the most recent sends only.
  const enrich = new Set(sent2026.slice(0, 60).map((n) => n.id));
  console.log(
    `✓ newsletters: ${all.length} total · ${in2026.length} in 2026 (${sent2026.length} sent, ${drafts2026.length} draft) · enriching ${enrich.size}`,
  );

  await db
    .delete(platformPostTable)
    .where(and(eq(platformPostTable.brandId, wander.id), eq(platformPostTable.externalKind, "broadcast")));

  const ppRows: (typeof platformPostTable.$inferInsert)[] = [];
  for (const n of in2026) {
    const isDraft = !n.sent_at;
    let stats: PostStats | undefined;
    if (enrich.has(n.id)) {
      try {
        // App API returns time-series arrays under metric.series — sum them.
        const m = await cio<{ metric?: { series?: Record<string, number[]> } }>(
          `/newsletters/${n.id}/metrics?period=months&steps=12`,
        );
        const series = m.metric?.series ?? {};
        const sum = (k: string) => (series[k] ?? []).reduce((a, b) => a + (b || 0), 0);
        stats = {
          sent: sum("sent"),
          delivered: sum("delivered"),
          opened: sum("opened"),
          clicks: sum("clicked"),
          bounced: sum("bounced"),
          unsubscribed: sum("unsubscribed"),
          converted: sum("converted"),
        };
      } catch (e) {
        console.warn(`  metrics ${n.id} failed: ${(e as Error).message}`);
      }
    }
    ppRows.push({
      id: createId("pp"),
      brandId: wander.id,
      channelId: dispatch?.id ?? null,
      platform: "newsletter",
      username: dispatch?.handle ?? "The Dispatch",
      source: "owned",
      status: isDraft ? "draft" : "published",
      origin: "human",
      provider: "customerio",
      text: n.name,
      stats,
      externalId: String(n.id),
      externalKind: "broadcast",
      externalUrl: `${UI}/broadcasts/${n.id}`,
      cleanupStatus: isDraft ? cleanupForDraft(n.name) : "keep",
      isSeed: false, // real imported content, not demo data
      publishedAt: n.sent_at ? new Date(num(n.sent_at) * 1000) : undefined,
      createdAt: n.created ? new Date(num(n.created) * 1000) : new Date(),
    });
  }
  for (let i = 0; i < ppRows.length; i += 200) {
    await db.insert(platformPostTable).values(ppRows.slice(i, i + 200));
  }
  console.log(`✓ inserted ${ppRows.length} newsletter platform_posts`);

  // ---- 2 & 3. Campaigns + transactional → lifecycle_campaign ----------
  //
  // This mirror is wipe-and-reinsert, but `cleanupStatus` and `programId` are
  // operator-owned, not mirrored facts — an archive/keep call a human (or the
  // sequence-triage agent) made must outlive the next refresh. Snapshot them
  // by externalId first, then restore on re-insert. Derived cleanup heuristics
  // only apply to rows we haven't seen before.
  // Key by kind + id: CIO campaigns and transactional messages have separate
  // id spaces that collide (id 42 is both a campaign and a transactional), so
  // an externalId-only key hands one row the other's decision.
  const priorState = new Map(
    (
      await db
        .select({
          externalKind: lifecycleCampaignTable.externalKind,
          externalId: lifecycleCampaignTable.externalId,
          cleanupStatus: lifecycleCampaignTable.cleanupStatus,
          programId: lifecycleCampaignTable.programId,
        })
        .from(lifecycleCampaignTable)
        .where(
          and(
            eq(lifecycleCampaignTable.brandId, wander.id),
            eq(lifecycleCampaignTable.provider, "customerio"),
          ),
        )
    ).map((r) => [`${r.externalKind ?? ""}:${r.externalId ?? ""}`, r]),
  );
  const carried = (
    externalKind: "campaign" | "transactional",
    externalId: string,
    derived: CleanupStatus,
  ) => {
    const prior = priorState.get(`${externalKind}:${externalId}`);
    return {
      cleanupStatus: prior?.cleanupStatus ?? derived,
      programId: prior?.programId ?? null,
    };
  };

  await db
    .delete(lifecycleCampaignTable)
    .where(and(eq(lifecycleCampaignTable.brandId, wander.id), eq(lifecycleCampaignTable.provider, "customerio")));

  // Campaigns (journeys)
  const campaigns =
    (await cio<{ campaigns?: CioCampaign[] }>(`/campaigns`)).campaigns ?? [];
  let touchpointCount = 0;
  for (const c of campaigns) {
    const name = c.name || "Untitled";
    const type = c.type ?? "";
    const state = c.state ?? "";
    const lcId = createId("lc");
    const draftish = state === "draft" || DUP_RX.test(name);
    await db.insert(lifecycleCampaignTable).values({
      id: lcId,
      brandId: wander.id,
      channelId: dispatch?.id ?? null,
      name,
      kind: lifecycleKind(name, type),
      runState: runStateFromCampaign(state),
      externalKind: "campaign",
      triggerEvent: c.event_name ?? null,
      provider: "customerio",
      externalId: String(c.id),
      externalUrl: `${UI}/campaigns/${c.id}`,
      ...carried("campaign", String(c.id), draftish ? "candidate" : "keep"),
      startedAt: c.first_started ? new Date(num(c.first_started) * 1000) : undefined,
      metadata: { type, active: c.active },
    });
    const actions = c.actions ?? [];
    const msgs = actions.filter((a) => a.type in TOUCHPOINT_CHANNELS);
    if (msgs.length) {
      await db.insert(lifecycleTouchpointTable).values(
        msgs.map((a, i) => ({
          id: createId("lt"),
          campaignId: lcId,
          channel: TOUCHPOINT_CHANNELS[a.type] ?? "other",
          position: i,
          externalId: String(a.id),
        })),
      );
      touchpointCount += msgs.length;
    }
  }
  console.log(`✓ inserted ${campaigns.length} campaigns + ${touchpointCount} touchpoints`);

  // Transactional messages
  const tx =
    (await cio<{ messages?: CioTransactional[] }>(`/transactional`)).messages ?? [];
  for (const m of tx) {
    const name = m.name || "Untitled";
    const draftish = DUP_RX.test(name);
    await db.insert(lifecycleCampaignTable).values({
      id: createId("lc"),
      brandId: wander.id,
      channelId: dispatch?.id ?? null,
      name,
      description: m.description || null,
      kind: "transactional",
      // App API doesn't expose transactional state — infer from name heuristic.
      runState: draftish ? "draft" : "running",
      externalKind: "transactional",
      triggerEvent: m.trigger_name || null,
      provider: "customerio",
      externalId: String(m.id),
      externalUrl: `${UI}/transactional/${m.id}`,
      ...carried("transactional", String(m.id), draftish ? "candidate" : "keep"),
    });
  }
  console.log(`✓ inserted ${tx.length} transactional as lifecycle_campaign`);

  console.log("\n🔁 Customer.io import complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
