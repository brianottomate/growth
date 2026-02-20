/**
 * BDR (Business Development Representative) Assignment Service
 *
 * In-memory round-robin state for assigning leads to BDRs.
 * Dual-pool: one for leads with email+phone, one for email-only.
 *
 * State resets on cold start — acceptable for now.
 * Future: persist state to DB or KV store.
 *
 * Ported from wander-growth-api/app/services/bdr/
 */
import { formatDistanceStrict } from "date-fns";
import {
  getOwnerProspectLoad,
  getUsers,
} from "@/server/clients/outreach.client";

// =====================================================
// BDR CONFIGURATION
// =====================================================

export interface BdrConfig {
  name: string;
  email: string;
  outreachUserId: string;
  active: boolean;
  assignNewLeads: boolean;
  slackChannelId?: string;
}

interface DynamicBdrCandidate {
  outreachUserId: string;
  name: string;
  email: string;
  title: string | null;
  active: boolean;
}

interface DynamicBdrSelectionOptions {
  titleIncludes?: string;
  excludeTitleContains?: string[];
  allowUserIds?: string[];
  includeEmails?: string[];
  pageSize?: number;
}

export interface DynamicBdrLoadSnapshot {
  outreachUserId: string;
  name: string;
  email: string;
  title: string | null;
  prospectCount: number | null;
  lastProspectTouchedAt: string | null;
  lastProspectUpdatedAt: string | null;
  filterUsed?: string | null;
}

export interface DynamicBdrSelectionResult {
  assignedBdr: BdrConfig | null;
  reason: string;
  source: "outreach_load";
  pool: "email+phone" | "email-only";
  totalCandidates: number;
  eligibleCandidates: number;
  selectedLoad: DynamicBdrLoadSnapshot | null;
  topCandidates: DynamicBdrLoadSnapshot[];
}

const DEFAULT_DYNAMIC_BDR_OPTIONS: Required<DynamicBdrSelectionOptions> = {
  titleIncludes: "bdr",
  excludeTitleContains: ["manager"],
  allowUserIds: [],
  includeEmails: [],
  pageSize: 100,
};

/**
 * BDR Roster — hardcoded for now.
 *
 * TODO: Fetch from Sanity CMS or DB in the future.
 * Each BDR needs a valid Outreach user ID for prospect ownership.
 *
 * Populate with actual BDR data before going live.
 */
export const BDR_ROSTER: BdrConfig[] = [
  // Example entries — replace with actual BDR data:
  // {
  //   name: "Alex Smith",
  //   email: "alex@wander.com",
  //   outreachUserId: "12345",
  //   active: true,
  //   assignNewLeads: true,
  // },
];

// =====================================================
// ROUND-ROBIN STATE
// =====================================================

interface AssignmentState {
  emailPhoneIndex: number;
  emailOnlyIndex: number;
  totalAssignments: number;
}

let state: AssignmentState = {
  emailPhoneIndex: 0,
  emailOnlyIndex: 0,
  totalAssignments: 0,
};

// =====================================================
// ASSIGNMENT LOGIC
// =====================================================

/**
 * Get active BDRs eligible for new lead assignment.
 */
function getActiveBdrs(): BdrConfig[] {
  return BDR_ROSTER.filter((bdr) => bdr.active && bdr.assignNewLeads);
}

function toTimestamp(value: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? Number.POSITIVE_INFINITY : ts;
}

function formatRelativeDelta(from: string | null, to: string | null): string {
  if (!from || !to) return "n/a";
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return "n/a";
  }

  if (fromDate.getTime() === toDate.getTime()) return "same time";
  const direction = toDate > fromDate ? "newer" : "older";
  const delta = formatDistanceStrict(fromDate, toDate);
  return `${delta} ${direction}`;
}

function applyDynamicCandidateFilters(
  candidates: DynamicBdrCandidate[],
  options: Required<DynamicBdrSelectionOptions>,
): DynamicBdrCandidate[] {
  let filtered = candidates.filter((c) => c.active);

  const titleIncludes = options.titleIncludes.trim().toLowerCase();
  if (titleIncludes.length > 0) {
    filtered = filtered.filter((c) =>
      (c.title ?? "").toLowerCase().includes(titleIncludes),
    );
  }

  if (options.excludeTitleContains.length > 0) {
    const excludes = options.excludeTitleContains.map((x) => x.toLowerCase());
    filtered = filtered.filter(
      (c) =>
        !excludes.some((needle) =>
          (c.title ?? "").toLowerCase().includes(needle),
        ),
    );
  }

  if (options.allowUserIds.length > 0) {
    const allowSet = new Set(options.allowUserIds);
    filtered = filtered.filter((c) => allowSet.has(c.outreachUserId));
  }

  if (options.includeEmails.length > 0) {
    const includeSet = new Set(options.includeEmails.map((x) => x.toLowerCase()));
    filtered = filtered.filter((c) => includeSet.has(c.email.toLowerCase()));
  }

  return filtered;
}

/**
 * Assign the next BDR using dual-pool round-robin.
 *
 * @param hasPhone - Whether the lead has a phone number.
 *   Leads with phone numbers go into the email+phone pool,
 *   email-only leads go into the email-only pool.
 *   Each pool has its own index for fair distribution.
 *
 * @returns The assigned BDR, or null if no BDRs are available.
 */
export function getNextBdr(hasPhone: boolean): BdrConfig | null {
  const activeBdrs = getActiveBdrs();

  if (activeBdrs.length === 0) {
    console.warn("⚠️ [BDR] No active BDRs available for assignment");
    return null;
  }

  let index: number;
  if (hasPhone) {
    index = state.emailPhoneIndex % activeBdrs.length;
    state.emailPhoneIndex++;
  } else {
    index = state.emailOnlyIndex % activeBdrs.length;
    state.emailOnlyIndex++;
  }

  state.totalAssignments++;
  const bdr = activeBdrs[index]!;

  console.log(
    `👤 [BDR] Assigned ${bdr.name} (pool: ${hasPhone ? "email+phone" : "email-only"}, index: ${index})`,
  );

  return bdr;
}

/**
 * Select next BDR using live Outreach load signals.
 *
 * Strategy:
 * 1. Fetch active users
 * 2. Filter to BDR candidate pool
 * 3. Fetch owner prospect load for each candidate
 * 4. Pick lowest prospectCount, then oldest touchedAt, then lowest user ID
 */
export async function getNextBdrFromOutreachLoad(
  hasPhone: boolean,
  options?: DynamicBdrSelectionOptions,
): Promise<BdrConfig | null> {
  const result = await getNextBdrFromOutreachLoadDetailed(hasPhone, options);
  return result.assignedBdr;
}

/**
 * Same selection as getNextBdrFromOutreachLoad, but returns decision context.
 */
export async function getNextBdrFromOutreachLoadDetailed(
  hasPhone: boolean,
  options?: DynamicBdrSelectionOptions,
): Promise<DynamicBdrSelectionResult> {
  const merged: Required<DynamicBdrSelectionOptions> = {
    ...DEFAULT_DYNAMIC_BDR_OPTIONS,
    ...options,
  };
  const pool: "email+phone" | "email-only" = hasPhone
    ? "email+phone"
    : "email-only";

  const usersResponse = await getUsers({ pageSize: merged.pageSize });
  const candidates = applyDynamicCandidateFilters(
    usersResponse.data.map((user) => ({
      outreachUserId: String(user.id),
      name: user.attributes.name,
      email: user.attributes.email,
      title: user.attributes.title,
      active: !user.attributes.locked,
    })),
    merged,
  );

  if (candidates.length === 0) {
    console.warn("⚠️ [BDR] No eligible Outreach BDR candidates found");
    return {
      assignedBdr: null,
      reason: "No eligible Outreach BDR candidates found after filters",
      source: "outreach_load",
      pool,
      totalCandidates: usersResponse.data.length,
      eligibleCandidates: 0,
      selectedLoad: null,
      topCandidates: [],
    };
  }

  const loads = await Promise.all(
    candidates.map(async (candidate) => {
      try {
        const load = await getOwnerProspectLoad({
          ownerId: candidate.outreachUserId,
        });
        return {
          ...candidate,
          ...load,
          ok: true as const,
        };
      } catch (error) {
        console.warn(
          `⚠️ [BDR] Failed to fetch load for ${candidate.name} (${candidate.outreachUserId})`,
          error,
        );
        return {
          ...candidate,
          prospectCount: null,
          lastProspectTouchedAt: null,
          ok: false as const,
        };
      }
    }),
  );

  const eligible = loads.filter((l) => l.ok);
  if (eligible.length === 0) {
    console.warn("⚠️ [BDR] No BDR candidates had valid load data");
    return {
      assignedBdr: null,
      reason: "Candidates found, but no load data could be fetched",
      source: "outreach_load",
      pool,
      totalCandidates: candidates.length,
      eligibleCandidates: 0,
      selectedLoad: null,
      topCandidates: [],
    };
  }

  const ranked = [...eligible].sort((a, b) => {
    const touchedA = toTimestamp(a.lastProspectTouchedAt);
    const touchedB = toTimestamp(b.lastProspectTouchedAt);
    if (touchedA !== touchedB) return touchedA - touchedB;
    return 0;
  });
  const bestTouched = toTimestamp(ranked[0]?.lastProspectTouchedAt ?? null);
  const tiedTop = ranked.filter(
    (candidate) =>
      toTimestamp(candidate.lastProspectTouchedAt) === bestTouched,
  );
  const selected =
    tiedTop[Math.floor(Math.random() * tiedTop.length)] ?? ranked[0];
  if (!selected) {
    console.warn("⚠️ [BDR] No BDR candidate selected after load sorting");
    return {
      assignedBdr: null,
      reason: "No BDR candidate selected after sorting",
      source: "outreach_load",
      pool,
      totalCandidates: candidates.length,
      eligibleCandidates: eligible.length,
      selectedLoad: null,
      topCandidates: [],
    };
  }

  const assignedBdr: BdrConfig = {
    name: selected.name,
    email: selected.email.toLowerCase(),
    outreachUserId: selected.outreachUserId,
    active: true,
    assignNewLeads: true,
  };
  const selectedLoad: DynamicBdrLoadSnapshot = {
    outreachUserId: selected.outreachUserId,
    name: selected.name,
    email: selected.email.toLowerCase(),
    title: selected.title,
    prospectCount: selected.prospectCount,
    lastProspectTouchedAt: selected.lastProspectTouchedAt,
    lastProspectUpdatedAt: selected.lastProspectUpdatedAt ?? null,
    filterUsed: selected.filterUsed ?? null,
  };
  const topCandidates: DynamicBdrLoadSnapshot[] = ranked
    .slice(0, 3)
    .map((candidate) => ({
      outreachUserId: candidate.outreachUserId,
      name: candidate.name,
      email: candidate.email.toLowerCase(),
      title: candidate.title,
      prospectCount: candidate.prospectCount,
      lastProspectTouchedAt: candidate.lastProspectTouchedAt,
      lastProspectUpdatedAt: candidate.lastProspectUpdatedAt ?? null,
      filterUsed: candidate.filterUsed ?? null,
    }));
  const alternatives = topCandidates
    .slice(1)
    .map(
      (candidate) =>
        `${candidate.name}(count=${candidate.prospectCount ?? "n/a"}, touchedAt=${candidate.lastProspectTouchedAt ?? "null"}, delta=${formatRelativeDelta(selected.lastProspectTouchedAt, candidate.lastProspectTouchedAt)})`,
    )
    .join(", ");
  console.log(
    `👤 [BDR] Selected ${selected.name} via Outreach load (count=${selected.prospectCount}, touchedAt=${selected.lastProspectTouchedAt ?? "null"})${alternatives ? ` | next: ${alternatives}` : ""}`,
  );

  return {
    assignedBdr,
    reason:
      "Selected by oldest lastProspectTouchedAt; random tie-breaker for exact timestamp ties",
    source: "outreach_load",
    pool,
    totalCandidates: candidates.length,
    eligibleCandidates: eligible.length,
    selectedLoad,
    topCandidates,
  };
}

/**
 * Validate that an existing BDR assignment is still active.
 *
 * @returns The BDR config if valid, null if not found or inactive.
 */
export function validateExistingAssignment(
  assignedBdrEmail: string,
): BdrConfig | null {
  const bdr = BDR_ROSTER.find(
    (b) => b.email.toLowerCase() === assignedBdrEmail.toLowerCase(),
  );

  if (!bdr) {
    console.log(
      `⚠️ [BDR] Assignment to ${assignedBdrEmail} not found in roster`,
    );
    return null;
  }

  if (!bdr.active) {
    console.log(`⚠️ [BDR] Assignment to ${bdr.name} invalid — BDR is inactive`);
    return null;
  }

  return bdr;
}

/**
 * Look up a BDR by their Outreach user ID.
 */
export function getBdrByOutreachId(outreachUserId: string): BdrConfig | null {
  return BDR_ROSTER.find((b) => b.outreachUserId === outreachUserId) ?? null;
}

/**
 * Get current assignment stats for debugging.
 */
export function getAssignmentStats() {
  const activeBdrs = getActiveBdrs();
  return {
    rosterSize: BDR_ROSTER.length,
    activeBdrs: activeBdrs.length,
    emailPhoneIndex: state.emailPhoneIndex,
    emailOnlyIndex: state.emailOnlyIndex,
    totalAssignments: state.totalAssignments,
    roster: BDR_ROSTER.map((b) => ({
      name: b.name,
      active: b.active,
      assignNewLeads: b.assignNewLeads,
    })),
  };
}

/**
 * Reset the round-robin indices. Useful for testing.
 */
export function resetRoundRobin(): void {
  state = {
    emailPhoneIndex: 0,
    emailOnlyIndex: 0,
    totalAssignments: 0,
  };
  console.log("🔄 [BDR] Round-robin state reset");
}
