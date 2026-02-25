/**
 * Outreach → Customer.io Sync Workflow
 *
 * Processes prospect.updated events from Outreach and syncs:
 * - Owner (BDR) changes → CIO assigned_bdr_email / _name / _outreach_id
 * - Stage changes → CIO outreach_stage_id / outreach_stage_name
 *
 * Only processes human-initiated changes (actor.type === "User") to avoid
 * circular syncs when our own CIO→Outreach pipeline sets ownership.
 */
import "server-only";

import {
  getProspectById,
  getUserById,
} from "@/server/clients/outreach.client";
import {
  updateBdrAssignment,
  updateCustomerAttributes,
} from "@/server/clients/customerio.client";
import { OUTREACH_STAGES } from "@/server/services/outreach/field-mapping";

// =====================================================
// STAGE NAME LOOKUP
// =====================================================

const STAGE_ID_TO_NAME: Record<number, string> = {
  [OUTREACH_STAGES.DEMAND_NEW]: "Demand New",
  [OUTREACH_STAGES.DEMAND_BOOKED]: "Demand Booked",
  [OUTREACH_STAGES.DEMAND_BOOKED_DIRECT]: "Demand Booked Direct",
};

function getStageName(stageId: string): string {
  const id = Number(stageId);
  return STAGE_ID_TO_NAME[id] ?? `Stage ${stageId}`;
}

// =====================================================
// TYPES
// =====================================================

export interface OutreachToCioSyncResult {
  status: "synced" | "skipped" | "error";
  reason?: string;
  email?: string;
  prospectId?: string | number;
  bdrSynced?: boolean;
  stageSynced?: boolean;
  processingTimeMs: number;
}

// =====================================================
// CORE PROCESSOR
// =====================================================

export async function processOutreachProspectUpdate(params: {
  prospectId: string | number;
  newOwnerId: string | null;
  oldOwnerId: string | null;
  newStageId: string | null;
  oldStageId: string | null;
  /** actor.type from webhook meta — null means our S2S app made the change */
  actorType: string | null;
}): Promise<OutreachToCioSyncResult> {
  const startMs = Date.now();
  const { prospectId, newOwnerId, oldOwnerId, newStageId, oldStageId, actorType } = params;

  const ownerChanged = newOwnerId !== null && newOwnerId !== oldOwnerId;
  const stageChanged = newStageId !== null && newStageId !== oldStageId;

  if (!ownerChanged && !stageChanged) {
    return {
      status: "skipped",
      reason: "no_relevant_changes",
      prospectId,
      processingTimeMs: Date.now() - startMs,
    };
  }

  // Skip S2S-originated owner changes (actor null = our own CIO→Outreach pipeline).
  // Stage changes are always synced regardless of actor since we never write stage from CIO.
  if (ownerChanged && !stageChanged && actorType === null) {
    return {
      status: "skipped",
      reason: "s2s_actor_owner_change",
      prospectId,
      processingTimeMs: Date.now() - startMs,
    };
  }

  // Fetch prospect to get email — not included in delta payload
  const prospect = await getProspectById(prospectId);
  if (!prospect) {
    return {
      status: "skipped",
      reason: "prospect_not_found",
      prospectId,
      processingTimeMs: Date.now() - startMs,
    };
  }

  const email = prospect.attributes.emails?.[0] ?? null;
  if (!email) {
    return {
      status: "skipped",
      reason: "no_email",
      prospectId,
      processingTimeMs: Date.now() - startMs,
    };
  }

  if (email.toLowerCase().endsWith("@wander.com")) {
    return {
      status: "skipped",
      reason: "internal_email",
      email,
      prospectId,
      processingTimeMs: Date.now() - startMs,
    };
  }

  let bdrSynced = false;
  let stageSynced = false;
  const errors: string[] = [];

  // ── BDR assignment sync ───────────────────────────────────────────────────
  if (ownerChanged && newOwnerId) {
    try {
      const user = await getUserById(newOwnerId);
      if (user) {
        await updateBdrAssignment({
          customerEmail: email,
          bdrEmail: user.attributes.email,
          bdrName: user.attributes.name,
          bdrOutreachId: String(user.id),
        });
        bdrSynced = true;
        console.log(
          `✅ [OutreachToCio] BDR synced: ${email} → ${user.attributes.name} (outreachId=${newOwnerId})`,
        );
      } else {
        console.warn(`⚠️ [OutreachToCio] Owner user not found: ${newOwnerId}`);
        errors.push(`owner_user_not_found:${newOwnerId}`);
      }
    } catch (err) {
      console.error(`❌ [OutreachToCio] BDR sync failed for ${email}:`, err);
      errors.push("bdr_sync_error");
    }
  }

  // ── Stage sync ────────────────────────────────────────────────────────────
  if (stageChanged && newStageId) {
    try {
      await updateCustomerAttributes(email, {
        outreach_stage_id: Number(newStageId),
        outreach_stage_name: getStageName(newStageId),
      });
      stageSynced = true;
      console.log(
        `✅ [OutreachToCio] Stage synced: ${email} → ${getStageName(newStageId)} (id=${newStageId})`,
      );
    } catch (err) {
      console.error(`❌ [OutreachToCio] Stage sync failed for ${email}:`, err);
      errors.push("stage_sync_error");
    }
  }

  const processingTimeMs = Date.now() - startMs;
  const status = bdrSynced || stageSynced ? "synced" : "error";

  console.log(
    `📋 [OutreachToCio] prospect=${prospectId} email=${email}: bdr=${bdrSynced}, stage=${stageSynced} (${processingTimeMs}ms)`,
  );

  return {
    status,
    email,
    prospectId,
    bdrSynced,
    stageSynced,
    processingTimeMs,
    ...(errors.length ? { reason: errors.join(", ") } : {}),
  };
}
