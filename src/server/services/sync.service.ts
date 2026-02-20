import "server-only";

import { fetchLeadForRealtimeSync } from "@/server/clients/bigquery.client";
import {
  getCustomerByEmail,
  updateBdrAssignment,
} from "@/server/clients/customerio.client";
import {
  searchProspectByEmail,
  createProspect,
  updateProspect,
  getUsers,
  isOutreachConfigured,
} from "@/server/clients/outreach.client";
import {
  buildCreatePayload,
  buildUpdatePayload,
  type LeadData,
} from "@/server/services/outreach/field-mapping";
import {
  getNextBdr,
  getNextBdrFromOutreachLoad,
  type BdrConfig,
} from "@/server/services/outreach/bdr-assignment.service";
import {
  enrichByEmail as enrichFromMinerva,
  isMinervaConfigured,
} from "@/server/clients/minerva.client";

// =====================================================
// SYNC RESULT
// =====================================================

export interface SyncResult {
  status: "success" | "failed" | "skipped";
  email: string;
  eventType: string;
  outreachAction?: "created" | "updated";
  outreachProspectId?: string;
  assignedBdr?: { name: string; email: string };
  dataSource?: string;
  processingTimeMs?: number;
  error?: string;
}

// =====================================================
// MAIN SYNC FUNCTION
// =====================================================

/**
 * Process a single lead through the CIO → Outreach sync pipeline.
 *
 * Flow:
 * 1. Fetch lead data from BigQuery and Customer.io
 * 2. Enrich phone number from available sources
 * 3. Determine BDR assignment (existing → validate → round-robin)
 * 4. Search Outreach for existing prospect
 * 5. Create or update prospect with mapped fields
 * 6. Update CIO with BDR assignment if newly assigned
 */
export async function processLead(params: {
  email: string;
  eventType: string;
  eventData?: Record<string, unknown>;
}): Promise<SyncResult> {
  const { email, eventType, eventData } = params;
  const startMs = Date.now();

  console.log(`\n🔄 [Sync] Processing lead: ${email} (event: ${eventType})`);

  try {
    // -----------------------------------------------
    // Step 1: Fetch lead data
    // -----------------------------------------------
    let leadData: LeadData | null = null;
    let dataSource = "none";

    console.log("📊 [Sync] Fetching from BigQuery + Customer.io + Minerva...");
    const [bqResult, cioResult, minervaResult] = await Promise.allSettled([
      fetchLeadForRealtimeSync({
        email,
        eventType,
        propertyName: eventData?.property_name as string | undefined,
      }),
      getCustomerByEmail(email),
      isMinervaConfigured ? enrichFromMinerva(email) : Promise.resolve(null),
    ]);

    const bqData =
      bqResult.status === "fulfilled"
        ? bqResult.value
        : null;
    if (bqResult.status === "rejected") {
      console.warn("⚠️ [Sync] BigQuery fetch failed", bqResult.reason);
    }

    const cioCustomer =
      cioResult.status === "fulfilled"
        ? cioResult.value
        : null;
    if (cioResult.status === "rejected") {
      console.warn("⚠️ [Sync] Customer.io fetch failed", cioResult.reason);
    }

    const minervaData =
      minervaResult.status === "fulfilled"
        ? minervaResult.value
        : null;
    if (minervaResult.status === "rejected") {
      console.warn("⚠️ [Sync] Minerva fetch failed", minervaResult.reason);
    } else if (isMinervaConfigured) {
      if (minervaData) {
        console.log(
          `🔮 [Minerva] Enriched ${email}: phone=${minervaData.phone ?? "none"}, city=${minervaData.city ?? "none"}, state=${minervaData.state ?? "none"}, income=${minervaData.estimatedIncomeRange ?? "none"}`,
        );
      } else {
        console.log(`🔮 [Minerva] No enrichment match for ${email}`);
      }
    }

    if (bqData && cioCustomer) {
      const cioLead = transformCioToLeadFormat(cioCustomer, eventType, eventData);
      leadData = mergeLeadData(bqData as LeadData, cioLead);
      dataSource = "bigquery+customerio";
      console.log(
        `✅ [Sync] BQ + CIO data found (bqUser=${bqData.id_user}, cioId=${cioCustomer.id})`,
      );
    } else if (bqData) {
      leadData = bqData as LeadData;
      dataSource = "bigquery";
      console.log(`✅ [Sync] BigQuery data found (user: ${bqData.id_user})`);
    } else if (cioCustomer) {
      leadData = transformCioToLeadFormat(cioCustomer, eventType, eventData);
      dataSource = "customerio";
      console.log(`✅ [Sync] Customer.io data found (id: ${cioCustomer.id})`);
    }

    // If no data from either source, build minimal lead from webhook
    if (!leadData) {
      console.log("⚠️ [Sync] No data from BQ or CIO, using webhook data only");
      leadData = {
        email,
        webhook_event_type: eventType,
        webhook_property_name: eventData?.property_name as string | undefined,
        first_name: eventData?.first_name as string | undefined,
        last_name: eventData?.last_name as string | undefined,
        phone: eventData?.phone as string | undefined,
      };
      dataSource = "webhook";
    }

    // Set webhook context on all paths
    leadData.webhook_event_type = eventType;
    if (eventData?.property_name) {
      leadData.webhook_property_name = eventData.property_name as string;
    }

    // -----------------------------------------------
    // Step 2: Apply Minerva enrichment + phone fallback
    // -----------------------------------------------
    if (minervaData) {
      const minervaBackfilled: string[] = [];
      if (!leadData.phone && minervaData.phone) {
        leadData.phone = minervaData.phone;
        minervaBackfilled.push("phone");
      }
      if (!leadData.city && minervaData.city) {
        leadData.city = minervaData.city;
        minervaBackfilled.push("city");
      }
      if (!leadData.state && minervaData.state) {
        leadData.state = minervaData.state;
        minervaBackfilled.push("state");
      }
      if (!leadData.country && minervaData.country) {
        leadData.country = minervaData.country;
        minervaBackfilled.push("country");
      }
      if (!leadData.minerva_household_income && minervaData.estimatedIncomeRange) {
        leadData.minerva_household_income = minervaData.estimatedIncomeRange;
        minervaBackfilled.push("minerva_household_income");
      }
      if (minervaBackfilled.length > 0) {
        console.log(
          `🔮 [Sync] Backfilled from Minerva: ${minervaBackfilled.join(", ")}`,
        );
      }
    }

    leadData.phone = await enrichPhone(leadData, eventData);

    // -----------------------------------------------
    // Step 3: Check Outreach for existing prospect
    // -----------------------------------------------
    if (!isOutreachConfigured) {
      console.log("⚠️ [Sync] Outreach not configured — skipping");
      return {
        status: "skipped",
        email,
        eventType,
        dataSource,
        error: "Outreach not configured",
        processingTimeMs: Date.now() - startMs,
      };
    }

    const existingProspect = await searchProspectByEmail(email);

    // -----------------------------------------------
    // Step 4: Determine BDR assignment (Outreach owner is source of truth)
    // -----------------------------------------------
    let assignedBdr: BdrConfig | null = null;
    let assignmentSource: "outreach_owner" | "outreach_load" | "static_round_robin" | "cio_existing" | "none" = "none";

    if (existingProspect) {
      const existingOwnerId = getProspectOwnerId(existingProspect);
      if (existingOwnerId) {
        const ownerUser = await getOutreachUserById(existingOwnerId);
        assignedBdr = {
          name: ownerUser?.name ?? `Outreach User ${existingOwnerId}`,
          email: ownerUser?.email?.toLowerCase() ?? "",
          outreachUserId: existingOwnerId,
          active: true,
          assignNewLeads: true,
        };
        assignmentSource = "outreach_owner";
        console.log(
          `✅ [Sync] Preserving existing Outreach owner: ${assignedBdr.name} (${assignedBdr.outreachUserId})`,
        );
      }
    }

    if (!assignedBdr) {
      const existingBdrOutreachId = ((leadData as Record<string, unknown>)
        .assignedBdrOutreachId as string | null) ?? null;
      const existingBdrEmail = ((leadData as Record<string, unknown>)
        .assignedBdrEmail as string | null) ?? null;
      const cioAssignee = await resolveCioAssignedOutreachUser(
        existingBdrOutreachId,
        existingBdrEmail,
      );

      if (cioAssignee) {
        assignedBdr = {
          name: cioAssignee.name,
          email: cioAssignee.email?.toLowerCase() ?? "",
          outreachUserId: cioAssignee.id,
          active: true,
          assignNewLeads: true,
        };
        assignmentSource = "cio_existing";
        console.log(
          `✅ [Sync] Reusing existing CIO assignment from Outreach: ${assignedBdr.name} (${assignedBdr.outreachUserId})`,
        );
      }
    }

    if (!assignedBdr) {
      const hasPhone = !!leadData.phone;
      assignedBdr = await getNextBdrFromOutreachLoad(hasPhone);
      if (assignedBdr) {
        assignmentSource = "outreach_load";
      } else {
        assignedBdr = getNextBdr(hasPhone);
        if (assignedBdr) assignmentSource = "static_round_robin";
      }
      if (assignedBdr) {
        console.log(
          `🆕 [Sync] New BDR selected (${assignmentSource}): ${assignedBdr.name}`,
        );
      }
    }

    // -----------------------------------------------
    // Step 5: Create or update prospect
    // -----------------------------------------------
    let outreachAction: "created" | "updated";
    let prospectId: string;

    if (existingProspect) {
      // Update existing prospect
      console.log(
        `✏️ [Sync] Updating existing prospect ${existingProspect.id}`,
      );

      // Carry forward existing sync count
      leadData.existing_sync_count =
        parseInt((existingProspect.attributes.custom51!) ?? "0", 10) ||
        0;

      const { attributes, stageId } = buildUpdatePayload(
        leadData,
        existingProspect.attributes.tags,
      );
      console.log(
        `📝 [Sync] Would write UPDATE payload: fields=${Object.keys(attributes).length}, stage=${stageId ?? "unchanged"}, owner=${assignedBdr?.outreachUserId ?? "none"}`,
      );

      const updated = await updateProspect(existingProspect.id, {
        attributes,
        stageId,
        ownerId: assignedBdr
          ? parseInt(assignedBdr.outreachUserId, 10)
          : undefined,
      });

      outreachAction = "updated";
      prospectId = String(updated.id);
    } else {
      // Create new prospect
      console.log(`➕ [Sync] Creating new prospect for ${email}`);

      const { attributes, stageId } = buildCreatePayload(leadData);
      console.log(
        `📝 [Sync] Would write CREATE payload: fields=${Object.keys(attributes).length}, stage=${stageId}, owner=${assignedBdr?.outreachUserId ?? "none"}`,
      );

      const created = await createProspect({
        attributes,
        stageId,
        ownerId: assignedBdr
          ? parseInt(assignedBdr.outreachUserId, 10)
          : undefined,
      });

      outreachAction = "created";
      prospectId = String(created.id);
    }

    // -----------------------------------------------
    // Step 6: Update CIO with BDR assignment (parity with Outreach owner)
    // -----------------------------------------------
    const cioAssignedEmail = ((leadData as Record<string, unknown>)
      .assignedBdrEmail as string | null)?.toLowerCase() ?? null;
    const cioAssignedOutreachId = ((leadData as Record<string, unknown>)
      .assignedBdrOutreachId as string | null) ?? null;
    const shouldWriteCioAssignment =
      !!assignedBdr &&
      (cioAssignedOutreachId !== assignedBdr.outreachUserId ||
        cioAssignedEmail !== assignedBdr.email.toLowerCase());

    if (shouldWriteCioAssignment && assignedBdr) {
      if (!assignedBdr.email) {
        console.warn(
          `⚠️ [Sync] Skipping CIO parity write-back for ${assignedBdr.outreachUserId}: owner email not available`,
        );
      } else {
      console.log(
          `📧 [Sync] Writing CIO ownership parity (${assignmentSource}): ${assignedBdr.name}`,
      );
      try {
        await updateBdrAssignment({
          customerEmail: email,
          bdrEmail: assignedBdr.email,
          bdrName: assignedBdr.name,
          bdrOutreachId: assignedBdr.outreachUserId,
        });
      } catch (error) {
        // Non-fatal — log and continue
        console.error("⚠️ [Sync] Failed to update CIO BDR assignment:", error);
      }
      }
    }

    // -----------------------------------------------
    // Done
    // -----------------------------------------------
    const processingTimeMs = Date.now() - startMs;

    console.log(
      `✅ [Sync] Complete: ${outreachAction} prospect ${prospectId} for ${email} in ${processingTimeMs}ms`,
    );

    return {
      status: "success",
      email,
      eventType,
      outreachAction,
      outreachProspectId: prospectId,
      assignedBdr: assignedBdr
        ? { name: assignedBdr.name, email: assignedBdr.email }
        : undefined,
      dataSource,
      processingTimeMs,
    };
  } catch (error) {
    const processingTimeMs = Date.now() - startMs;
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    console.error(
      `❌ [Sync] Failed for ${email} after ${processingTimeMs}ms:`,
      error,
    );

    return {
      status: "failed",
      email,
      eventType,
      error: errorMessage,
      processingTimeMs,
    };
  }
}

// =====================================================
// HELPERS
// =====================================================

/**
 * Transform CIO customer data to the normalized LeadData format.
 */
function transformCioToLeadFormat(
  cioCustomer: {
    id: string;
    email: string;
    attributes: Record<string, unknown>;
    assignedBdrEmail: string | null;
    assignedBdrName: string | null;
    assignedBdrOutreachId: string | null;
  },
  eventType: string,
  eventData?: Record<string, unknown>,
): LeadData {
  const attrs = cioCustomer.attributes;

  return {
    id_user: cioCustomer.id,
    email: cioCustomer.email,
    phone: (attrs.phone as string) ?? null,
    first_name: (attrs.first_name as string) ?? null,
    last_name: (attrs.last_name as string) ?? null,
    full_name:
      (attrs.full_name as string) ??
      ([attrs.first_name, attrs.last_name].filter(Boolean).join(" ") || null),
    city: (attrs.city as string) ?? null,
    state: (attrs.state as string) ?? null,
    country: (attrs.country as string) ?? null,

    // CIO doesn't have the rich activity data BQ has
    webhook_event_type: eventType,
    webhook_property_name: eventData?.property_name as string | undefined,

    // Pull what we can from CIO attributes
    count_confirmed_bookings:
      (attrs.count_confirmed_bookings as number) ?? null,
    total_spend: (attrs.total_spend as number) ?? null,
    minerva_rank: (attrs.minerva_rank as number) ?? null,

    // Pass through BDR assignment data (accessed in processLead)
    ...({
      assignedBdrEmail: cioCustomer.assignedBdrEmail,
      assignedBdrName: cioCustomer.assignedBdrName,
    } as Record<string, unknown>),
  } as LeadData;
}

function mergeLeadData(primary: LeadData, secondary: LeadData): LeadData {
  const mergedRecord: Record<string, unknown> = { ...primary };
  const secondaryRecord = secondary as Record<string, unknown>;
  const keysToBackfill: Array<keyof LeadData> = [
    "id_user",
    "email",
    "phone",
    "first_name",
    "last_name",
    "full_name",
    "city",
    "state",
    "country",
    "last_activity_ts",
    "last_activity_type",
    "last_activity_property_name",
    "last_checkout_property",
    "count_confirmed_bookings",
    "total_spend",
    "last_booking_date",
    "last_booked_property_name",
    "minerva_rank",
    "avg_review_score",
    "wishlisted_properties",
  ];

  for (const key of keysToBackfill) {
    if (mergedRecord[key] == null && secondaryRecord[key] != null) {
      mergedRecord[key] = secondaryRecord[key];
    }
  }

  for (const extraKey of ["assignedBdrEmail", "assignedBdrName"]) {
    if (secondaryRecord[extraKey] != null) {
      mergedRecord[extraKey] = secondaryRecord[extraKey];
    }
  }

  return mergedRecord as LeadData;
}

function getProspectOwnerId(prospect: {
  relationships?: Record<string, unknown>;
}): string | null {
  const relationships = prospect.relationships;
  if (!relationships || typeof relationships !== "object") return null;
  const owner = relationships.owner as
    | { data?: { id?: string | number } | Array<unknown> | null }
    | undefined;
  if (!owner?.data || Array.isArray(owner.data)) return null;
  const id = owner.data.id;
  if (id == null) return null;
  return String(id);
}

async function getOutreachUserById(outreachUserId: string): Promise<{
  id: string;
  name: string;
  email: string | null;
} | null> {
  const usersResponse = await getUsers({ pageSize: 100 });
  const match = usersResponse.data.find((u) => String(u.id) === outreachUserId);
  if (!match) return null;
  return {
    id: String(match.id),
    name: match.attributes.name,
    email: match.attributes.email ?? null,
  };
}

async function getOutreachUserByEmail(email: string): Promise<{
  id: string;
  name: string;
  email: string | null;
} | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const usersResponse = await getUsers({ pageSize: 100 });
  const match = usersResponse.data.find(
    (u) => (u.attributes.email ?? "").toLowerCase() === normalized,
  );
  if (!match) return null;
  return {
    id: String(match.id),
    name: match.attributes.name,
    email: match.attributes.email ?? null,
  };
}

async function resolveCioAssignedOutreachUser(
  outreachUserId: string | null,
  email: string | null,
): Promise<{
  id: string;
  name: string;
  email: string | null;
} | null> {
  if (outreachUserId) {
    const byId = await getOutreachUserById(outreachUserId);
    if (byId) return byId;
  }
  if (email) {
    return await getOutreachUserByEmail(email);
  }
  return null;
}

/**
 * Enrich phone number from available sources (ordered by priority).
 *
 * Priority: BigQuery/CIO/Minerva → webhook event data
 */
async function enrichPhone(
  leadData: LeadData,
  eventData?: Record<string, unknown>,
): Promise<string | null> {
  // BQ/CIO/Minerva phone can already be present in leadData.
  if (leadData.phone) return leadData.phone;

  // Webhook event data
  const webhookPhone = eventData?.phone as string | undefined;
  if (webhookPhone) return webhookPhone;

  // CIO profile phone would have already landed in leadData if present.
  return null;
}
