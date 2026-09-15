/**
 * Import HubSpot sales sequences into the growth DB — the /lifecycle mirror's
 * second provider (docs/hubspot-gateway-plan.md §8). Read-only against HubSpot;
 * idempotent on our side (wipes prior hubspot-sourced campaigns for the brand,
 * re-inserts; programs upsert in place).
 *
 *   bun run --conditions=react-server scripts/import-hubspot-sequences.ts
 *
 * Maps:
 *   - every sequence            → lifecycle_campaign (provider=hubspot, externalKind=sequence)
 *   - steps of LIVE sequences   → lifecycle_touchpoint (email / bdr_task)
 *   - the six WanderOS flows    → lifecycle_program (+ derived steps), linked
 *     both ways: campaign.programId and program_step.campaignId.
 *
 * Run state is derived from contact aggregates (no per-sequence state exists
 * in HubSpot): anyone currently enrolled → running, else ended.
 */
import { and, eq } from "drizzle-orm";

import { env } from "@/env";
import { db } from "@/server/db";
import {
  brandTable,
  lifecycleCampaignTable,
  lifecycleProgramStepTable,
  lifecycleProgramTable,
  lifecycleTouchpointTable,
  organizationTable,
} from "@/server/db/schema";
import type {
  CleanupStatus,
  LifecycleKind,
  LifecycleProgramPriority,
  TouchpointChannel,
} from "@/server/db/schema";
import { createId } from "@/server/db/utils";

const TOKEN = env.HUBSPOT_ACCESS_TOKEN_OPERATED;
if (!TOKEN) throw new Error("HUBSPOT_ACCESS_TOKEN_OPERATED not set");
const HUB_ID = "22480390";
// Sequences API requires a userId with sequence access; scopes live on the app.
const USER_ID = "87642320"; // Kristian

type HsSequenceStep = {
  id: string;
  stepOrder: number;
  delayMillis?: number;
  actionType: string; // "TASK" | "EMAIL" | "FINISH_ENROLLMENT"
  taskPattern?: { taskType?: string; subject?: string };
  emailPattern?: { templateId?: string };
};
type HsSequence = {
  id: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
  folderId?: string | number | null;
  userId?: string | number;
  steps?: HsSequenceStep[];
};

async function hs<T = Record<string, unknown>>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const r = await fetch(`https://api.hubapi.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!r.ok) throw new Error(`HubSpot ${path} → ${r.status} ${await r.text()}`);
  return (await r.json()) as T;
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

// Stale-clone heuristic for dead sequences (mirrors import-cio's DUP_RX intent).
const STALE_RX = /\(clone\)|test|template|untitled|\b20(23|24|25)\b|\d\/\d/i;

function sequenceKind(name: string): LifecycleKind {
  const n = name.toLowerCase();
  if (/re-?engage|winback|reactivat/.test(n)) return "reactivation";
  if (n.includes("inbound")) return "behavioral";
  return "outbound";
}

function stepChannel(s: HsSequenceStep): TouchpointChannel {
  if (s.actionType === "EMAIL") return "email";
  if (s.actionType === "TASK") {
    if (s.taskPattern?.taskType === "CALL") return "bdr_task";
    if (s.taskPattern?.taskType === "EMAIL") return "email"; // manual email task
    return "bdr_task";
  }
  return "other";
}

function stepName(s: HsSequenceStep): string {
  if (s.actionType === "EMAIL") return "Automated email";
  const sub = s.taskPattern?.subject?.trim();
  if (sub) return sub;
  return s.taskPattern?.taskType === "CALL" ? "Call task" : "Task";
}

const seqUrl = (id: string) =>
  `https://app.hubspot.com/sequences/${HUB_ID}/sequence/${id}`;

// The live WanderOS flows sales actually runs → strategic programs.
// Confirmed against sales' own list 2026-07-27; the May generation is still
// enrolled but several sequences have been superseded by July clones.
const PROGRAM_SEEDS: Array<{
  sequenceId: string;
  name: string;
  kind: LifecycleKind;
  priority: LifecycleProgramPriority;
  description: string;
}> = [
  {
    // Superseded 306457011 (same name, May clone still carrying enrollments).
    sequenceId: "307995758",
    name: "WanderOS Cold Outbound — Main",
    kind: "outbound",
    priority: "must_have",
    description:
      "Primary multi-channel cold motion: interleaved calls + emails over ~18 days. The workhorse sequence.",
  },
  {
    sequenceId: "307884887",
    name: "WanderOS Cold Outbound — Casago Franchisees",
    kind: "outbound",
    priority: "should_have",
    description:
      "Casago-franchisee cut of the main cold motion (Justin + Matt M, July 2026) — same shape, franchisee-specific copy.",
  },
  {
    sequenceId: "307398281",
    name: "WanderOS Self-Serve Re-engagement",
    kind: "reactivation",
    priority: "should_have",
    description:
      "Re-engages self-serve deals that went quiet after signup — calls plus email, distinct from the cold Re-engage motion.",
  },
  {
    sequenceId: "306457150",
    name: "WanderOS Outbound — Email Only",
    kind: "outbound",
    priority: "should_have",
    description:
      "Email-only variant of the cold motion, for segments/reps where calls don't fit.",
  },
  {
    sequenceId: "306459150",
    name: "WanderOS Outbound — GK Mainline",
    kind: "outbound",
    priority: "should_have",
    description:
      "Gatekeeper/mainline-number variant — for leads where we only have a switchboard.",
  },
  {
    sequenceId: "306459000",
    name: "WanderOS Outbound — Call Only",
    kind: "outbound",
    priority: "should_have",
    description: "Call-task-only cadence for phone-first segments.",
  },
  {
    sequenceId: "306458898",
    name: "WanderOS Re-engage",
    kind: "reactivation",
    priority: "should_have",
    description: "Re-engagement of previously-touched leads that went quiet.",
  },
  {
    sequenceId: "306515803",
    name: "WanderOS Inbound — Standard (non-listed)",
    kind: "behavioral",
    priority: "must_have",
    description: "Follow-up cadence for standard (non-listed) inbound leads.",
  },
];

async function main() {
  const org = await db.query.organizationTable.findFirst({
    where: eq(organizationTable.slug, "wander"),
  });
  if (!org) throw new Error("No 'wander' org — run the seed first.");
  const wander = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.slug, "wander"),
      eq(brandTable.organizationId, org.id),
    ),
  });
  if (!wander) throw new Error("No 'wander' brand.");
  console.log(`✓ target: brand=${wander.id}`);

  // ---- 1. All sequences (paginated) -----------------------------------
  const sequences: HsSequence[] = [];
  let after: string | undefined;
  do {
    const page = await hs<{
      total?: number;
      results?: HsSequence[];
      paging?: { next?: { after?: string } };
    }>(
      `/automation/v4/sequences?userId=${USER_ID}&limit=100${after ? `&after=${after}` : ""}`,
    );
    sequences.push(...(page.results ?? []));
    after = page.paging?.next?.after;
  } while (after);
  console.log(`✓ sequences: ${sequences.length}`);

  // ---- 2. Live enrollment counts from contact aggregates --------------
  // One paginated search over currently-enrolled contacts; count per sequence.
  const liveCounts = new Map<string, number>();
  let searchAfter: string | undefined;
  let scanned = 0;
  do {
    const page = await hs<{
      total: number;
      results: Array<{ properties?: Record<string, string | null> }>;
      paging?: { next?: { after?: string } };
    }>(`/crm/v3/objects/contacts/search`, {
      method: "POST",
      body: JSON.stringify({
        filterGroups: [
          {
            filters: [
              {
                propertyName: "hs_sequences_is_enrolled",
                operator: "EQ",
                value: "true",
              },
            ],
          },
        ],
        properties: ["hs_latest_sequence_enrolled"],
        limit: 200,
        ...(searchAfter ? { after: searchAfter } : {}),
      }),
    });
    for (const c of page.results) {
      const sid = c.properties?.hs_latest_sequence_enrolled;
      if (sid) liveCounts.set(sid, (liveCounts.get(sid) ?? 0) + 1);
    }
    scanned += page.results.length;
    searchAfter = page.paging?.next?.after;
    await sleep(300); // stay well under the shared 5 req/s search cap
  } while (searchAfter);
  console.log(
    `✓ live enrollment: ${scanned} contacts across ${liveCounts.size} sequences`,
  );

  // ---- 3. Mirror: sequences → lifecycle_campaign ----------------------
  //
  // `cleanupStatus` is an operator/agent decision, not a mirrored fact — carry
  // it across the wipe so an archive/keep call survives the next refresh. The
  // enrollment-derived default only applies to sequences we haven't seen.
  // (`programId` is re-linked from PROGRAM_SEEDS below, so it isn't carried.)
  const priorCleanup = new Map(
    (
      await db
        .select({
          externalId: lifecycleCampaignTable.externalId,
          cleanupStatus: lifecycleCampaignTable.cleanupStatus,
        })
        .from(lifecycleCampaignTable)
        .where(
          and(
            eq(lifecycleCampaignTable.brandId, wander.id),
            eq(lifecycleCampaignTable.provider, "hubspot"),
          ),
        )
    ).map((r) => [r.externalId ?? "", r.cleanupStatus]),
  );

  await db
    .delete(lifecycleCampaignTable)
    .where(
      and(
        eq(lifecycleCampaignTable.brandId, wander.id),
        eq(lifecycleCampaignTable.provider, "hubspot"),
      ),
    );

  const campaignIdBySequence = new Map<string, string>();
  let touchpointCount = 0;
  for (const seq of sequences) {
    const sid = String(seq.id);
    const live = liveCounts.get(sid) ?? 0;
    const lcId = createId("lc");
    campaignIdBySequence.set(sid, lcId);
    const cleanup: CleanupStatus =
      priorCleanup.get(sid) ??
      (live > 0 ? "keep" : STALE_RX.test(seq.name) ? "candidate" : "review");
    await db.insert(lifecycleCampaignTable).values({
      id: lcId,
      brandId: wander.id,
      name: seq.name.trim() || "Untitled sequence",
      kind: sequenceKind(seq.name),
      runState: live > 0 ? "running" : "ended",
      externalKind: "sequence",
      // Sequences have no trigger — contacts are enrolled manually / via API.
      triggerEvent: null,
      provider: "hubspot",
      externalId: sid,
      externalUrl: seqUrl(sid),
      cleanupStatus: cleanup,
      metrics: live > 0 ? { matched: live } : undefined,
      startedAt: seq.createdAt ? new Date(seq.createdAt) : undefined,
      metadata: { hsUserId: seq.userId, folderId: seq.folderId ?? null },
    });
  }
  console.log(`✓ inserted ${sequences.length} sequences as lifecycle_campaign`);

  // ---- 4. Steps of LIVE sequences → lifecycle_touchpoint --------------
  const liveIds = [...liveCounts.keys()].filter((sid) =>
    campaignIdBySequence.has(sid),
  );
  const stepsBySequence = new Map<string, HsSequenceStep[]>();
  for (const sid of liveIds) {
    const detail = await hs<HsSequence>(
      `/automation/v4/sequences/${sid}?userId=${USER_ID}`,
    );
    const steps = (detail.steps ?? [])
      .filter((s) => s.actionType !== "FINISH_ENROLLMENT")
      .sort((a, b) => a.stepOrder - b.stepOrder);
    stepsBySequence.set(sid, steps);
    const campaignId = campaignIdBySequence.get(sid);
    if (!campaignId || steps.length === 0) continue;
    let cumDays = 0;
    await db.insert(lifecycleTouchpointTable).values(
      steps.map((s) => {
        cumDays += (s.delayMillis ?? 0) / 86_400_000;
        return {
          id: createId("lt"),
          campaignId,
          name: stepName(s),
          channel: stepChannel(s),
          position: s.stepOrder,
          delayLabel: `Day ${Math.round(cumDays)}`,
          externalId: String(s.id),
        };
      }),
    );
    touchpointCount += steps.length;
    await sleep(150);
  }
  console.log(
    `✓ inserted ${touchpointCount} touchpoints across ${liveIds.length} live sequences`,
  );

  // ---- 5. Strategic layer: the six WanderOS programs ------------------
  const existingPrograms = await db.query.lifecycleProgramTable.findMany({
    where: eq(lifecycleProgramTable.brandId, wander.id),
  });
  let programCount = 0;
  let programStepCount = 0;
  for (const seed of PROGRAM_SEEDS) {
    const steps = stepsBySequence.get(seed.sequenceId) ?? [];
    const campaignId = campaignIdBySequence.get(seed.sequenceId) ?? null;
    const channels = [
      ...new Set(steps.map(stepChannel)),
    ] as TouchpointChannel[];

    const existing = existingPrograms.find(
      (p) =>
        (p.metadata as { sourceSequenceId?: string } | null)
          ?.sourceSequenceId === seed.sequenceId || p.name === seed.name,
    );
    const values = {
      name: seed.name,
      description: seed.description,
      kind: seed.kind,
      status: "active" as const,
      priority: seed.priority,
      workspace: "os" as const,
      intendedTrigger: "manual enrollment (HubSpot sequence)",
      intendedChannels: channels.length ? channels : null,
      targetTouchpoints: steps.length || null,
      metadata: { sourceSequenceId: seed.sequenceId },
    };

    let programId: string;
    if (existing) {
      programId = existing.id;
      await db
        .update(lifecycleProgramTable)
        .set(values)
        .where(eq(lifecycleProgramTable.id, programId));
      // Derived steps: wipe and re-insert.
      await db
        .delete(lifecycleProgramStepTable)
        .where(eq(lifecycleProgramStepTable.programId, programId));
    } else {
      programId = createId("lp");
      await db
        .insert(lifecycleProgramTable)
        .values({ id: programId, brandId: wander.id, ...values });
    }

    if (steps.length) {
      let cumMinutes = 0;
      await db.insert(lifecycleProgramStepTable).values(
        steps.map((s) => {
          cumMinutes += Math.round((s.delayMillis ?? 0) / 60_000);
          return {
            id: createId("lps"),
            programId,
            name: stepName(s),
            channel: stepChannel(s),
            status: "active" as const,
            system: "hubspot" as const,
            position: s.stepOrder,
            delayMinutes: cumMinutes,
            subject: s.taskPattern?.subject ?? null,
            url: seqUrl(seed.sequenceId),
            campaignId,
          };
        }),
      );
      programStepCount += steps.length;
    }

    // Link the mirrored campaign back to its program.
    if (campaignId) {
      await db
        .update(lifecycleCampaignTable)
        .set({ programId })
        .where(eq(lifecycleCampaignTable.id, campaignId));
    }
    programCount++;
    console.log(
      `  ${existing ? "updated" : "created"} program "${seed.name}" (${steps.length} steps${campaignId ? ", linked" : ""})`,
    );
  }
  console.log(
    `✓ ${programCount} programs seeded/updated with ${programStepCount} derived steps`,
  );

  console.log("\n🔁 HubSpot sequence import complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
