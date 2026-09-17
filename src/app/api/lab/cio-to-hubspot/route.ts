import { NextResponse } from "next/server";

import {
  getOwnerById,
  isHubspotConfigured,
} from "@/server/clients/hubspot.client";
import {
  DEMAND_BDR_ROSTER,
  findExistingDemandBdr,
  getAssignableDemandBdrs,
  getDemandAssignmentStats,
  toResolved,
} from "@/server/services/demand/bdr-assignment.service";
import {
  lookupDemandContact,
  writeDemandContact,
  type DemandContactState,
} from "@/server/services/demand/hubspot-sink.service";
import { getDemandSyncStatus } from "@/server/services/demand/status";
import { searchProspectByEmail } from "@/server/clients/outreach.client";
import {
  buildLeadData,
  cioAssignmentOf,
  resolveCioAssignedOutreachUser,
  resolveDemandCrms,
  resolveOutreachOwner,
  type BuiltLeadData,
} from "@/server/services/sync.service";
import { assertLabAccess } from "@/server/lab-access";

interface StepResult {
  step: string;
  status: "ok" | "skipped" | "failed" | "warning";
  durationMs: number;
  data?: unknown;
  error?: string;
}

/**
 * Dry-run of the demand-sales HubSpot sink — the HubSpot twin of
 * /api/lab/cio-to-outreach.
 *
 *   GET /api/lab/cio-to-hubspot?email=user@example.com
 *   GET /api/lab/cio-to-hubspot?email=user@example.com&event=abandoned_cart&property=Wander+Broken+Bow
 *   GET /api/lab/cio-to-hubspot?roster=1          (owner check only)
 *   GET /api/lab/cio-to-hubspot?status=1&hours=24 (webhook parity health)
 *
 * Runs every stage — enrichment, HubSpot lookup, BDR precedence (the same
 * rule production applies, Outreach owner included), the exact `demand_*`
 * payload — and writes nothing to HubSpot, Outreach or Customer.io. The
 * roster step resolves each BDR in DEMAND_BDR_ROSTER against live HubSpot
 * owners so the "who is actually assignable" question has a URL.
 */
export async function GET(request: Request) {
  const denied = await assertLabAccess(request);
  if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");
  const eventType = searchParams.get("event") ?? "checkout_started";
  const propertyName = searchParams.get("property") ?? undefined;
  const rosterOnly = searchParams.get("roster") === "1";
  const statusOnly = searchParams.get("status") === "1";

  if (statusOnly) {
    const hours = Number(searchParams.get("hours") ?? "24");
    const status = await getDemandSyncStatus(
      Number.isFinite(hours) && hours > 0 ? hours : 24,
    );
    return NextResponse.json({ crms: resolveDemandCrms(), ...status });
  }

  if (!email && !rosterOnly) {
    return NextResponse.json(
      {
        error: "Missing ?email= parameter (or ?roster=1 for the owner check)",
        usage:
          "/api/lab/cio-to-hubspot?email=user@example.com&event=checkout_started&property=Wander+Broken+Bow",
        supportedEvents: [
          "checkout_started",
          "payment_info_entered",
          "user_signed_up",
          "order_completed",
          "abandoned_search",
          "abandoned_wishlist",
          "abandoned_cart",
          "abandoned_payment",
        ],
      },
      { status: 400 },
    );
  }

  const totalStartMs = Date.now();
  const steps: StepResult[] = [];
  const crm = resolveDemandCrms();

  // -----------------------------------------------
  // Roster: is every BDR a live HubSpot owner?
  // -----------------------------------------------
  {
    const stepStart = Date.now();
    if (!isHubspotConfigured) {
      steps.push({
        step: "0_roster_check",
        status: "skipped",
        durationMs: 0,
        error: "HubSpot not configured",
      });
    } else {
      const entries = await Promise.all(
        DEMAND_BDR_ROSTER.map(async (bdr) => {
          if (!bdr.hubspotOwnerId) {
            return {
              name: bdr.name,
              email: bdr.email,
              hubspotOwnerId: null,
              verdict: "no HubSpot owner id in roster",
              assignable: false,
            };
          }
          try {
            const owner = await getOwnerById(bdr.hubspotOwnerId);
            const emailMatches =
              !!owner?.email &&
              owner.email.toLowerCase() === bdr.email.toLowerCase();
            const assignable = !!owner && !owner.archived && emailMatches;
            return {
              name: bdr.name,
              email: bdr.email,
              hubspotOwnerId: bdr.hubspotOwnerId,
              owner,
              verdict: !owner
                ? "owner id not found"
                : owner.archived
                  ? "owner is archived"
                  : emailMatches
                    ? "active"
                    : `active but email is ${owner.email ?? "missing"}`,
              assignable,
            };
          } catch (error) {
            return {
              name: bdr.name,
              email: bdr.email,
              hubspotOwnerId: bdr.hubspotOwnerId,
              verdict: `lookup failed: ${error instanceof Error ? error.message : String(error)}`,
              assignable: false,
            };
          }
        }),
      );
      const assignable = entries.filter((e) => e.assignable).length;
      steps.push({
        step: "0_roster_check",
        status: assignable > 0 ? "ok" : "warning",
        durationMs: Date.now() - stepStart,
        data: {
          assignable,
          roster: entries,
          stats: getDemandAssignmentStats(),
        },
      });
    }
  }

  if (rosterOnly || !email) {
    return NextResponse.json({
      dryRun: true,
      crms: crm,
      totalDurationMs: Date.now() - totalStartMs,
      steps,
    });
  }

  // -----------------------------------------------
  // Step 1: Lead data (BigQuery + CIO + Minerva, merged)
  // -----------------------------------------------
  let built: BuiltLeadData | null = null;
  {
    const stepStart = Date.now();
    try {
      built = await buildLeadData({
        email,
        eventType,
        eventData: { property_name: propertyName },
      });
      steps.push({
        step: "1_build_lead",
        status: built.dataSource === "webhook" ? "warning" : "ok",
        durationMs: Date.now() - stepStart,
        data: {
          dataSource: built.dataSource,
          minervaBackfilled: built.minervaBackfilled,
          lead: built.leadData,
        },
      });
    } catch (error) {
      steps.push({
        step: "1_build_lead",
        status: "failed",
        durationMs: Date.now() - stepStart,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (!built) {
    return NextResponse.json({
      dryRun: true,
      email,
      eventType,
      crms: crm,
      totalDurationMs: Date.now() - totalStartMs,
      steps,
    });
  }
  const lead = built.leadData;

  // -----------------------------------------------
  // Step 2: Existing HubSpot contact + demand state
  // -----------------------------------------------
  let existing: DemandContactState | null = null;
  {
    const stepStart = Date.now();
    if (!isHubspotConfigured) {
      steps.push({
        step: "2_hubspot_lookup",
        status: "skipped",
        durationMs: 0,
        error: "HubSpot not configured",
      });
    } else {
      try {
        existing = await lookupDemandContact(email);
        steps.push({
          step: "2_hubspot_lookup",
          status: "ok",
          durationMs: Date.now() - stepStart,
          data: existing ?? { message: "No contact — sink would create one" },
        });
      } catch (error) {
        steps.push({
          step: "2_hubspot_lookup",
          status: "failed",
          durationMs: Date.now() - stepStart,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  // -----------------------------------------------
  // Step 3: BDR precedence — the same rule production applies, Outreach
  // owner included
  // -----------------------------------------------
  const cioAssignment = cioAssignmentOf(lead);
  let outreachOwner = null;
  let cioResolved = null;
  if (crm.useOutreach) {
    try {
      const prospect = await searchProspectByEmail(email);
      outreachOwner = prospect ? await resolveOutreachOwner(prospect) : null;
      cioResolved = outreachOwner
        ? null
        : await resolveCioAssignedOutreachUser(
            cioAssignment.outreachId,
            cioAssignment.email,
          );
    } catch (error) {
      steps.push({
        step: "3a_outreach_owner",
        status: "warning",
        durationMs: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const found = findExistingDemandBdr({
    outreachActive: crm.useOutreach,
    outreachOwner,
    hubspotDemandBdr: existing
      ? { ownerId: existing.bdrOwnerId, email: existing.bdrEmail }
      : null,
    cioAssignment: {
      ...cioAssignment,
      resolved: cioResolved
        ? {
            name: cioResolved.name,
            email: cioResolved.email?.toLowerCase() ?? "",
            outreachUserId: cioResolved.id,
            hubspotOwnerId: null,
          }
        : null,
    },
  });
  let bdr = found.bdr;
  let source: string = found.source;
  if (!bdr) {
    // Preview only: production rotates (Outreach load-based in `both`, the
    // demand roster otherwise) and advances shared state; this does not.
    const pool = crm.useOutreach ? null : getAssignableDemandBdrs();
    const first = pool?.[0];
    if (first) {
      bdr = toResolved(first);
      source =
        "rotation (preview — first of the assignable pool, index not advanced)";
    } else if (crm.useOutreach) {
      source = "rotation (Outreach load-based; not previewed)";
    }
  }
  const newlyAssigned =
    !!bdr &&
    !(
      (bdr.hubspotOwnerId && existing?.bdrOwnerId === bdr.hubspotOwnerId) ||
      existing?.bdrEmail?.toLowerCase() === bdr.email.toLowerCase()
    );
  steps.push({
    step: "3_bdr_resolution",
    status: bdr ? "ok" : "warning",
    durationMs: 0,
    data: {
      outreachOwner,
      assignedBdr: bdr,
      source,
      newlyAssigned,
      pool: lead.phone ? "email+phone" : "email-only",
      cioAssignment,
      cioWouldWriteBack:
        !!bdr &&
        (cioAssignment.outreachId !==
          (bdr.outreachUserId ?? bdr.hubspotOwnerId) ||
          cioAssignment.email !== bdr.email),
    },
  });

  // -----------------------------------------------
  // Step 4: The exact demand_* payload
  // -----------------------------------------------
  {
    const stepStart = Date.now();
    const preview = await writeDemandContact({
      email,
      lead,
      existing,
      bdr,
      newlyAssigned,
      dryRun: true,
    });
    steps.push({
      step: "4_demand_payload",
      status: "ok",
      durationMs: Date.now() - stepStart,
      data: {
        wouldDo: existing ? `update contact ${existing.id}` : "create contact",
        propertyCount: Object.keys(preview.props).length,
        props: preview.props,
      },
    });
  }

  const failCount = steps.filter((s) => s.status === "failed").length;
  const warnCount = steps.filter((s) => s.status === "warning").length;
  return NextResponse.json({
    dryRun: true,
    email,
    eventType,
    propertyName: propertyName ?? null,
    crms: crm,
    totalDurationMs: Date.now() - totalStartMs,
    summary: {
      verdict:
        failCount > 0
          ? "PIPELINE HAS FAILURES"
          : warnCount > 0
            ? "PIPELINE OK WITH WARNINGS"
            : "PIPELINE READY",
      failed: failCount,
      warnings: warnCount,
    },
    steps,
  });
}
