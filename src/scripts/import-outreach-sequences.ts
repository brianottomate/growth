/**
 * Mirror Outreach sequences into the lifecycle strategy layer (view-only).
 *
 * Same posture as the CIO mirror (docs/customerio-integration.md): growth
 * stores run state, structure, and a metrics snapshot, and links out to
 * Outreach for edits/sends. Nothing is written back to Outreach.
 *
 * Mapping: sequence → lifecycle_campaign (kind=outbound, provider=outreach),
 * sequence step → lifecycle_touchpoint. Upserts by (provider, externalId) and
 * preserves programId links on refresh; sequences that disappear from
 * Outreach are soft-deleted. Touchpoints are structural — wiped + reinserted
 * per campaign on every run.
 *
 * Run: bun run src/scripts/import-outreach-sequences.ts
 */
import { and, eq, ilike, inArray } from "drizzle-orm";

import {
  getAllSequenceSteps,
  getAllSequences,
  type OutreachSequenceStep,
} from "@/server/clients/outreach.client";
import { db } from "@/server/db";
import {
  brandTable,
  lifecycleCampaignTable,
  lifecycleTouchpointTable,
} from "@/server/db/schema";
import type { TouchpointChannel } from "@/server/db/lifecycle-schema";

const STEP_CHANNEL: Record<
  OutreachSequenceStep["attributes"]["stepType"],
  TouchpointChannel
> = {
  auto_email: "email",
  manual_email: "email",
  call: "bdr_task",
  task: "bdr_task",
  sms: "sms",
};

function delayLabel(intervalMinutes: number, order: number) {
  if (order <= 1 && intervalMinutes === 0) return "immediately";
  if (intervalMinutes === 0) return "same day";
  const days = intervalMinutes / (24 * 60);
  if (days >= 1) return `after ${Math.round(days * 10) / 10} days`;
  const hours = intervalMinutes / 60;
  if (hours >= 1) return `after ${Math.round(hours)}h`;
  return `after ${intervalMinutes}m`;
}

async function main() {
  const brand = await db.query.brandTable.findFirst({
    where: ilike(brandTable.name, "wander"),
  });
  if (!brand) throw new Error("Wander brand not found — seed brands first.");

  console.log("Fetching sequences + steps from Outreach…");
  const { sequences, ownerNames } = await getAllSequences();
  // The S2S app grant currently covers `sequences` but NOT `sequenceSteps`
  // (401/403 verified 2026-07-16). Degrade to a stepless mirror until the
  // scope is added in Outreach admin; step counts still land via metadata.
  let allSteps: OutreachSequenceStep[] = [];
  let stepsAvailable = true;
  try {
    allSteps = await getAllSequenceSteps();
  } catch {
    stepsAvailable = false;
    console.warn(
      "⚠️ sequenceSteps not readable with current Outreach scopes — importing sequences without touchpoints. Grant `sequenceSteps.read` to the Wander Growth app to enable step mirroring.",
    );
  }
  console.log(
    `Fetched ${sequences.length} sequences, ${allSteps.length} steps.`,
  );

  const stepsBySequence = new Map<string, OutreachSequenceStep[]>();
  for (const step of allSteps) {
    const seqId = step.relationships?.sequence?.data?.id;
    if (seqId == null) continue;
    const key = String(seqId);
    const list = stepsBySequence.get(key) ?? [];
    list.push(step);
    stepsBySequence.set(key, list);
  }

  const existing = await db.query.lifecycleCampaignTable.findMany({
    where: and(
      eq(lifecycleCampaignTable.brandId, brand.id),
      eq(lifecycleCampaignTable.provider, "outreach"),
    ),
  });
  // One row per externalId wins the refresh: prefer a live row over a
  // soft-deleted one, then the oldest. Any further copies are redundant and
  // get soft-deleted below — self-healing if a bad run ever double-inserts.
  const ranked = [...existing].sort((a, b) => {
    const deleted = Number(Boolean(a.deletedAt)) - Number(Boolean(b.deletedAt));
    if (deleted !== 0) return deleted;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  const existingByExternalId = new Map<string, (typeof ranked)[number]>();
  const redundantIds: string[] = [];
  for (const row of ranked) {
    const key = row.externalId ?? "";
    if (!key) continue;
    if (!existingByExternalId.has(key)) existingByExternalId.set(key, row);
    else if (!row.deletedAt) redundantIds.push(row.id);
  }

  let inserted = 0;
  let refreshed = 0;
  const seenIds = new Set<string>();

  for (const seq of sequences) {
    const a = seq.attributes;
    // Outreach ids are numbers; `externalId` is text. Compare as text or the
    // upsert misses every row and duplicates the whole mirror.
    const seqId = String(seq.id);
    seenIds.add(seqId);
    const ownerId = seq.relationships?.owner?.data?.id;
    const values = {
      name: a.name,
      description: a.description,
      kind: "outbound" as const,
      runState: a.enabled ? ("running" as const) : ("paused" as const),
      externalKind: "sequence",
      provider: "outreach" as const,
      externalId: seqId,
      externalUrl: `https://web.outreach.io/sequences/${seqId}/overview`,
      metrics: {
        matched: a.numContactedProspects,
        delivered: a.deliverCount,
        opened: a.openCount,
        clicked: a.clickCount,
        converted: a.positiveReplyCount,
        bounced: a.bounceCount,
      },
      startedAt: a.enabledAt ? new Date(a.enabledAt) : null,
      lastSentAt: a.lastUsedAt ? new Date(a.lastUsedAt) : null,
      metadata: {
        tags: a.tags,
        owner: ownerId != null ? (ownerNames.get(ownerId) ?? ownerId) : null,
        stepCount: a.sequenceStepCount,
        replyCount: a.replyCount,
        optOutCount: a.optOutCount,
        failureCount: a.failureCount,
        locked: a.locked,
      },
      deletedAt: null,
      updatedAt: new Date(),
    };

    const prior = existingByExternalId.get(seqId);
    let campaignId: string;
    if (prior) {
      // Refresh mirror fields; keep programId + cleanupStatus (operator-owned).
      const [row] = await db
        .update(lifecycleCampaignTable)
        .set(values)
        .where(eq(lifecycleCampaignTable.id, prior.id))
        .returning({ id: lifecycleCampaignTable.id });
      campaignId = row!.id;
      refreshed += 1;
    } else {
      const [row] = await db
        .insert(lifecycleCampaignTable)
        .values({ ...values, brandId: brand.id })
        .returning({ id: lifecycleCampaignTable.id });
      campaignId = row!.id;
      inserted += 1;
    }

    // Touchpoints are structural: wipe + reinsert — but only when the steps
    // endpoint is readable, so a scope regression never erases the mirror.
    if (!stepsAvailable) continue;
    const steps = (stepsBySequence.get(seqId) ?? []).sort(
      (x, y) => x.attributes.order - y.attributes.order,
    );
    await db
      .delete(lifecycleTouchpointTable)
      .where(eq(lifecycleTouchpointTable.campaignId, campaignId));
    if (steps.length) {
      await db.insert(lifecycleTouchpointTable).values(
        steps.map((step) => ({
          campaignId,
          name:
            step.attributes.displayName ??
            step.attributes.stepType.replaceAll("_", " "),
          channel: STEP_CHANNEL[step.attributes.stepType] ?? "other",
          position: step.attributes.order,
          delayLabel: delayLabel(
            step.attributes.interval,
            step.attributes.order,
          ),
          externalId: String(step.id),
        })),
      );
    }
  }

  // Redundant duplicates of a kept row → soft-delete (reversible; a later run
  // never resurrects them because the kept row always wins the map).
  if (redundantIds.length) {
    await db
      .update(lifecycleCampaignTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(inArray(lifecycleCampaignTable.id, redundantIds));
  }

  // Sequences that vanished from Outreach → soft-delete their mirror rows.
  const vanished = existing.filter(
    (c) =>
      c.externalId &&
      !seenIds.has(c.externalId) &&
      !c.deletedAt &&
      !redundantIds.includes(c.id),
  );
  if (vanished.length) {
    await db
      .update(lifecycleCampaignTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        inArray(
          lifecycleCampaignTable.id,
          vanished.map((c) => c.id),
        ),
      );
  }

  console.log(
    `lifecycle_campaign (outreach): ${inserted} inserted, ${refreshed} refreshed, ${vanished.length} soft-deleted, ${redundantIds.length} duplicates collapsed.`,
  );
}

await main();
process.exit(0);
