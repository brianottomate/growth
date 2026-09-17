import { fetchLeadForRealtimeSync } from "@/server/clients/bigquery.client";
import {
  getCustomerByEmail,
  updateBdrAssignment,
} from "@/server/clients/customerio.client";
import { isHubspotConfigured } from "@/server/clients/hubspot.client";
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
  getSemanticName,
  OUTREACH_STAGES,
  type LeadData,
} from "@/server/services/outreach/field-mapping";
import {
  getNextBdr,
  getNextBdrFromOutreachLoad,
} from "@/server/services/outreach/bdr-assignment.service";
import {
  findExistingDemandBdr,
  getNextDemandBdr,
  toResolved,
  withRosterIds,
  type DemandAssignmentSource,
  type ResolvedBdr,
} from "@/server/services/demand/bdr-assignment.service";
import {
  lookupDemandContact,
  writeDemandContact,
  type DemandContactState,
} from "@/server/services/demand/hubspot-sink.service";
import { resolveHubspotOwnerIdByEmail } from "@/server/services/demand/owners";
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
  hubspotAction?: "created" | "updated";
  hubspotContactId?: string;
  /** HubSpot failure that did not fail the lead (shadow mode only). */
  hubspotError?: string;
  assignedBdr?: { name: string; email: string };
  assignmentSource?: DemandAssignmentSource;
  dataSource?: string;
  processingTimeMs?: number;
  error?: string;
}

// =====================================================
// DEMAND CRMS
// =====================================================

/**
 * Both CRMs are written on every sync — there is no switch. Outreach is the
 * system BDRs work in today, so its owner is authoritative and a HubSpot
 * failure never fails a lead while Outreach is configured; it is logged on the
 * `[DemandSync]` line instead (docs/demand-sales-hubspot.md).
 */
export function resolveDemandCrms(): {
  useOutreach: boolean;
  useHubspot: boolean;
  /** HubSpot errors fail the lead only when HubSpot is the only sink. */
  hubspotFatal: boolean;
} {
  return {
    useOutreach: isOutreachConfigured,
    useHubspot: isHubspotConfigured,
    hubspotFatal: isHubspotConfigured && !isOutreachConfigured,
  };
}

// =====================================================
// LOGGING HELPERS
// =====================================================

/** Map custom attribute keys back to semantic names for readable logs. */
function describeFields(attributes: Record<string, unknown>): string {
  const names: string[] = [];
  for (const [key, value] of Object.entries(attributes)) {
    if (value == null || key === "tags") continue;
    names.push(key.startsWith("custom") ? (getSemanticName(key) ?? key) : key);
  }
  return names.length > 0 ? names.join(", ") : "none";
}

/** Compact data source status for the outcome log line. */
function dataSourcesSummary(
  bqData: null | object,
  cioData: null | object,
  minervaData: null | object,
  minervaBackfilled: string[],
): string {
  const minervaStr = minervaData
    ? `Minerva✅${minervaBackfilled.length ? `(${minervaBackfilled.join(",")})` : ""}`
    : "Minerva❌";
  return [
    bqData ? "BQ✅" : "BQ❌",
    cioData ? "CIO✅" : "CIO❌",
    minervaStr,
  ].join("  ");
}

/** Human-readable stage name for the outcome log line. */
function stageName(stageId: number | undefined): string {
  if (!stageId) return "unchanged";
  const entry = Object.entries(OUTREACH_STAGES).find(([, v]) => v === stageId);
  return entry ? `${entry[0]}(${stageId})` : String(stageId);
}

function ownerSummary(
  bdr: ResolvedBdr | null,
  source: DemandAssignmentSource,
): string {
  if (!bdr) return "owner: none";
  const ids = [
    bdr.outreachUserId ? `outreach:${bdr.outreachUserId}` : null,
    bdr.hubspotOwnerId ? `hubspot:${bdr.hubspotOwnerId}` : null,
  ]
    .filter(Boolean)
    .join(" ");
  return `owner: ${bdr.name}(${ids || "-"}, src: ${source})`;
}

// =====================================================
// LEAD DATA
// =====================================================

export interface BuiltLeadData {
  leadData: LeadData;
  dataSource: string;
  bqData: LeadData | null;
  cioCustomer: Awaited<ReturnType<typeof getCustomerByEmail>>;
  minervaData: Awaited<ReturnType<typeof enrichFromMinerva>> | null;
  minervaBackfilled: string[];
}

/**
 * Steps 1–2 of the pipeline: fetch BigQuery + Customer.io + Minerva in
 * parallel, merge, apply webhook context, enrich phone. Shared by
 * `processLead` and the lab dry-run harnesses so a diagnostic sees exactly
 * what production would write.
 */
export async function buildLeadData(params: {
  email: string;
  eventType: string;
  eventData?: Record<string, unknown>;
}): Promise<BuiltLeadData> {
  const { email, eventType, eventData } = params;
  let leadData: LeadData | null = null;
  let dataSource = "none";

  const [bqResult, cioResult, minervaResult] = await Promise.allSettled([
    fetchLeadForRealtimeSync({
      email,
      eventType,
      propertyName: eventData?.property_name as string | undefined,
    }),
    getCustomerByEmail(email),
    isMinervaConfigured ? enrichFromMinerva(email) : Promise.resolve(null),
  ]);

  const bqData = bqResult.status === "fulfilled" ? bqResult.value : null;
  if (bqResult.status === "rejected") {
    console.warn("⚠️ [Sync] BigQuery fetch failed", bqResult.reason);
  }

  const cioCustomer = cioResult.status === "fulfilled" ? cioResult.value : null;
  if (cioResult.status === "rejected") {
    console.warn("⚠️ [Sync] Customer.io fetch failed", cioResult.reason);
  }

  const minervaData =
    minervaResult.status === "fulfilled" ? minervaResult.value : null;
  if (minervaResult.status === "rejected") {
    console.warn("⚠️ [Sync] Minerva fetch failed", minervaResult.reason);
  }

  if (bqData && cioCustomer) {
    const cioLead = transformCioToLeadFormat(cioCustomer, eventType, eventData);
    leadData = mergeLeadData(bqData, cioLead);
    dataSource = "bigquery+customerio";
  } else if (bqData) {
    leadData = bqData;
    dataSource = "bigquery";
  } else if (cioCustomer) {
    leadData = transformCioToLeadFormat(cioCustomer, eventType, eventData);
    dataSource = "customerio";
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
  leadData.last_activity_type = eventType;

  // Keep last-event filters fresh even when CIO templates omit/format timestamp inconsistently.
  const rawTimestamp = eventData?.timestamp;
  const nowIso = new Date().toISOString();
  if (
    rawTimestamp != null &&
    rawTimestamp !== "" &&
    (typeof rawTimestamp === "string" || typeof rawTimestamp === "number")
  ) {
    const parsed = new Date(rawTimestamp);
    if (!isNaN(parsed.getTime())) {
      const ageMs = Date.now() - parsed.getTime();
      const maxAgeMs = 1000 * 60 * 60 * 24 * 7; // 7 days
      leadData.last_activity_ts =
        ageMs >= 0 && ageMs <= maxAgeMs ? parsed.toISOString() : nowIso;
    } else {
      leadData.last_activity_ts = nowIso;
    }
  } else {
    leadData.last_activity_ts = nowIso;
  }

  // Carry forward checkout-specific context (checkin/checkout dates, amount)
  // CIO renders missing dates as the string "false" — filter those out
  const rawDestination = eventData?.search_destination;
  if (typeof rawDestination === "string" && rawDestination) {
    leadData.webhook_search_destination = rawDestination;
  }
  const rawSearchCount = eventData?.search_count;
  if (rawSearchCount != null && !isNaN(Number(rawSearchCount))) {
    leadData.webhook_search_count = Number(rawSearchCount);
  }
  const rawLastSearch = eventData?.last_search_date;
  if (typeof rawLastSearch === "string" && rawLastSearch) {
    leadData.webhook_last_search_date = rawLastSearch;
  }
  const rawCheckin = eventData?.checkin;
  if (
    rawCheckin != null &&
    rawCheckin !== false &&
    rawCheckin !== "false" &&
    rawCheckin !== "" &&
    (typeof rawCheckin === "string" || typeof rawCheckin === "number")
  ) {
    leadData.webhook_checkin_date = String(rawCheckin);
  }
  const rawCheckout = eventData?.checkout;
  if (
    rawCheckout != null &&
    rawCheckout !== false &&
    rawCheckout !== "false" &&
    rawCheckout !== "" &&
    (typeof rawCheckout === "string" || typeof rawCheckout === "number")
  ) {
    leadData.webhook_checkout_date = String(rawCheckout);
  }
  const rawAmount = eventData?.checkout_amount;
  if (rawAmount != null && rawAmount !== "") {
    const amount = Number(rawAmount);
    if (!isNaN(amount) && amount > 0) leadData.webhook_checkout_amount = amount;
  }

  // Minerva enrichment + phone fallback
  const minervaBackfilled: string[] = [];
  if (minervaData) {
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
    if (
      !leadData.minerva_household_income &&
      minervaData.estimatedIncomeRange
    ) {
      leadData.minerva_household_income = minervaData.estimatedIncomeRange;
      minervaBackfilled.push("minerva_household_income");
    }
  }

  leadData.phone = await enrichPhone(leadData, eventData);

  return {
    leadData,
    dataSource,
    bqData,
    cioCustomer,
    minervaData,
    minervaBackfilled,
  };
}

/** Customer.io's current BDR attributes, as carried on the merged lead. */
export function cioAssignmentOf(leadData: LeadData): {
  email: string | null;
  outreachId: string | null;
} {
  const record = leadData as Record<string, unknown>;
  return {
    email:
      ((record.assignedBdrEmail as string | null) ?? null)?.toLowerCase() ??
      null,
    outreachId: (record.assignedBdrOutreachId as string | null) ?? null,
  };
}

// =====================================================
// MAIN SYNC FUNCTION
// =====================================================

/**
 * Process a single lead through the CIO → CRM sync pipeline.
 *
 * Flow:
 * 1. Fetch lead data from BigQuery and Customer.io
 * 2. Enrich phone number from available sources
 * 3. Look up the existing prospect (Outreach) and contact (HubSpot)
 * 4. Determine BDR assignment (existing owner → CIO attrs → rotation)
 * 5. Create or update the prospect / contact with mapped fields
 * 6. Update CIO with BDR assignment if newly assigned
 */
export async function processLead(params: {
  email: string;
  eventType: string;
  eventData?: Record<string, unknown>;
}): Promise<SyncResult> {
  const { email, eventType, eventData } = params;
  const startMs = Date.now();

  if (email.toLowerCase().endsWith("@wander.com")) {
    console.log(`⏭️ [Sync] Skipping internal email: ${email}`);
    return {
      status: "skipped",
      email,
      eventType,
      error: "internal_email",
      processingTimeMs: Date.now() - startMs,
    };
  }

  try {
    // -----------------------------------------------
    // Steps 1–2: Fetch + enrich lead data
    // -----------------------------------------------
    const {
      leadData,
      dataSource,
      bqData,
      cioCustomer,
      minervaData,
      minervaBackfilled,
    } = await buildLeadData({ email, eventType, eventData });
    const sources = dataSourcesSummary(
      bqData,
      cioCustomer,
      minervaData,
      minervaBackfilled,
    );

    // -----------------------------------------------
    // Step 3: Look up the existing record in each active CRM
    // -----------------------------------------------
    const { useOutreach, useHubspot, hubspotFatal } = resolveDemandCrms();
    if (!useOutreach && !useHubspot) {
      console.log(
        "⚠️ [Sync] Neither Outreach nor HubSpot configured — skipping",
      );
      return {
        status: "skipped",
        email,
        eventType,
        dataSource,
        error: "No demand CRM configured",
        processingTimeMs: Date.now() - startMs,
      };
    }

    const existingProspect = useOutreach
      ? await searchProspectByEmail(email)
      : null;

    // In shadow mode a HubSpot lookup failure must not cost the Outreach
    // write; in hubspot mode it is the write, so let it fail the lead. Either
    // way the reason is logged on the `[DemandSync]` line below.
    let existingContact: DemandContactState | null = null;
    let hubspotError: string | undefined;
    if (useHubspot) {
      try {
        existingContact = await lookupDemandContact(email);
      } catch (error) {
        if (hubspotFatal) throw error;
        hubspotError = `lookup: ${error instanceof Error ? error.message : String(error)}`;
        console.error(`⚠️ [Sync] HubSpot lookup failed for ${email}:`, error);
      }
    }
    const hubspotWritable = useHubspot && hubspotError === undefined;

    // -----------------------------------------------
    // Step 4: Determine BDR assignment (existing owner is source of truth)
    // -----------------------------------------------
    const outreachOwner = existingProspect
      ? await resolveOutreachOwner(existingProspect)
      : null;

    const cioAssignment = cioAssignmentOf(leadData);
    // Outreach knows people the static roster does not; resolve CIO's
    // attributes against its live user list while Outreach is still written.
    const cioResolved =
      useOutreach && !outreachOwner
        ? await resolveCioAssignedOutreachUser(
            cioAssignment.outreachId,
            cioAssignment.email,
          )
        : null;

    const existing = findExistingDemandBdr({
      outreachActive: useOutreach,
      outreachOwner,
      hubspotDemandBdr: existingContact
        ? {
            ownerId: existingContact.bdrOwnerId,
            email: existingContact.bdrEmail,
          }
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
    let assignedBdr = existing.bdr;
    let assignmentSource = existing.source;

    if (!assignedBdr) {
      const hasPhone = !!leadData.phone;
      if (useOutreach) {
        const fromLoad = await getNextBdrFromOutreachLoad(hasPhone);
        const picked = fromLoad ?? getNextBdr(hasPhone);
        if (picked) {
          assignedBdr = withRosterIds({
            name: picked.name,
            email: picked.email.toLowerCase(),
            outreachUserId: picked.outreachUserId,
            hubspotOwnerId: null,
          });
          assignmentSource = fromLoad ? "outreach_load" : "static_round_robin";
        }
      } else {
        const picked = getNextDemandBdr(hasPhone);
        if (picked) {
          assignedBdr = toResolved(picked);
          assignmentSource = "rotation";
        }
      }
    }

    // A rep outside the static roster (manual reassignment, live-load pick)
    // still gets a real picker value when HubSpot knows their email.
    if (hubspotWritable && assignedBdr && !assignedBdr.hubspotOwnerId) {
      try {
        const ownerId = await resolveHubspotOwnerIdByEmail(assignedBdr.email);
        if (ownerId) assignedBdr = { ...assignedBdr, hubspotOwnerId: ownerId };
      } catch (error) {
        console.warn(
          `⚠️ [Sync] Could not resolve HubSpot owner for ${assignedBdr.email}:`,
          error,
        );
      }
    }

    // -----------------------------------------------
    // Step 5a: Outreach — create or update prospect
    // -----------------------------------------------
    let outreachAction: SyncResult["outreachAction"];
    let prospectId: string | undefined;

    if (useOutreach) {
      const ownerId = assignedBdr?.outreachUserId
        ? parseInt(assignedBdr.outreachUserId, 10)
        : undefined;

      if (existingProspect) {
        // Carry forward existing sync count
        leadData.existing_sync_count =
          parseInt(existingProspect.attributes.custom51! ?? "0", 10) || 0;

        const { attributes, stageId } = buildUpdatePayload(
          leadData,
          existingProspect.attributes.tags,
        );

        const updated = await updateProspect(existingProspect.id, {
          attributes,
          stageId,
          ownerId,
        });

        outreachAction = "updated";
        prospectId = String(updated.id);

        console.log(
          `✅ [Sync] updated #${prospectId} | ${sources} | ${ownerSummary(assignedBdr, assignmentSource)} | stage: ${stageName(stageId)} | fields: ${describeFields(attributes)}`,
        );
      } else {
        const { attributes, stageId, personaId } = buildCreatePayload(leadData);

        const created = await createProspect({
          attributes,
          stageId,
          personaId,
          ownerId,
        });

        outreachAction = "created";
        prospectId = String(created.id);

        console.log(
          `✅ [Sync] created #${prospectId} | ${sources} | ${ownerSummary(assignedBdr, assignmentSource)} | stage: ${stageName(stageId)} | fields: ${describeFields(attributes)}`,
        );
      }
    }

    // -----------------------------------------------
    // Step 5b: HubSpot — create or force-update the contact's demand_* props
    // -----------------------------------------------
    let hubspotAction: SyncResult["hubspotAction"];
    let hubspotContactId: string | undefined;

    if (hubspotWritable) {
      // Stamp demand_assigned_at when the rep changes, not only the first time.
      const newlyAssigned =
        !!assignedBdr && !contactHasBdr(existingContact, assignedBdr);
      try {
        const written = await writeDemandContact({
          email,
          lead: leadData,
          existing: existingContact,
          bdr: assignedBdr,
          newlyAssigned,
        });
        if (written.action !== "dry_run") {
          hubspotAction = written.action;
          hubspotContactId = written.contactId ?? undefined;
        }
        console.log(
          `✅ [Sync] hubspot ${written.action} #${written.contactId} | ${ownerSummary(assignedBdr, assignmentSource)} | fields: ${Object.keys(written.props).join(", ") || "none"}`,
        );
      } catch (error) {
        if (hubspotFatal) throw error;
        hubspotError = `write: ${error instanceof Error ? error.message : String(error)}`;
        console.error(`⚠️ [Sync] HubSpot write failed for ${email}:`, error);
      }
    }

    // -----------------------------------------------
    // Step 6: Update CIO with BDR assignment (parity with the CRM owner)
    // -----------------------------------------------
    // CIO's attribute is still named `assigned_bdr_outreach_id`; once Outreach
    // is gone it carries the HubSpot owner id (docs/demand-sales-hubspot.md).
    const cioBdrId = assignedBdr
      ? (assignedBdr.outreachUserId ?? assignedBdr.hubspotOwnerId)
      : null;
    const shouldWriteCioAssignment =
      !!assignedBdr &&
      !!cioBdrId &&
      (cioAssignment.outreachId !== cioBdrId ||
        cioAssignment.email !== assignedBdr.email.toLowerCase());

    if (shouldWriteCioAssignment && assignedBdr && cioBdrId) {
      if (!assignedBdr.email) {
        console.warn(
          `⚠️ [Sync] Skipping CIO parity write-back for ${cioBdrId}: owner email not available`,
        );
      } else {
        try {
          await updateBdrAssignment({
            customerEmail: email,
            bdrEmail: assignedBdr.email,
            bdrName: assignedBdr.name,
            bdrOutreachId: cioBdrId,
          });
        } catch (error) {
          // Non-fatal — log and continue
          console.error(
            "⚠️ [Sync] Failed to update CIO BDR assignment:",
            error,
          );
        }
      }
    }

    // -----------------------------------------------
    // Done
    // -----------------------------------------------
    const processingTimeMs = Date.now() - startMs;

    // One grep-able line per lead: `grep "\[DemandSync\]"` tells the whole
    // story of the rollout — which CRMs were written, by whom, how long.
    console.log(
      `📦 [DemandSync] ${email} | ${eventType} | outreach=${outreachAction ? `${outreachAction}#${prospectId}` : "-"} | hubspot=${hubspotAction ? `${hubspotAction}#${hubspotContactId}` : hubspotError ? "FAILED" : "-"} | ${ownerSummary(assignedBdr, assignmentSource)} | ${processingTimeMs}ms${hubspotError ? ` | hubspotError=${hubspotError}` : ""}`,
    );

    return {
      status: "success",
      email,
      eventType,
      outreachAction,
      outreachProspectId: prospectId,
      hubspotAction,
      hubspotContactId,
      hubspotError,
      assignedBdr: assignedBdr
        ? { name: assignedBdr.name, email: assignedBdr.email }
        : undefined,
      assignmentSource,
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
      assignedBdrOutreachId: cioCustomer.assignedBdrOutreachId,
    } as Record<string, unknown>),
  };
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

  for (const extraKey of [
    "assignedBdrEmail",
    "assignedBdrName",
    "assignedBdrOutreachId",
  ]) {
    if (secondaryRecord[extraKey] != null) {
      mergedRecord[extraKey] = secondaryRecord[extraKey];
    }
  }

  return mergedRecord;
}

/** True when the contact already names this rep (by HubSpot id or email). */
function contactHasBdr(
  contact: DemandContactState | null,
  bdr: ResolvedBdr,
): boolean {
  if (!contact) return false;
  if (bdr.hubspotOwnerId && contact.bdrOwnerId === bdr.hubspotOwnerId) {
    return true;
  }
  return (
    !!contact.bdrEmail &&
    contact.bdrEmail.toLowerCase() === bdr.email.toLowerCase()
  );
}

/** The Outreach prospect's owner as a BDR, or null when it has none. */
export async function resolveOutreachOwner(prospect: {
  relationships?: Record<string, unknown>;
}): Promise<ResolvedBdr | null> {
  const ownerId = getProspectOwnerId(prospect);
  if (!ownerId) return null;
  const ownerUser = await getOutreachUserById(ownerId);
  return {
    name: ownerUser?.name ?? `Outreach User ${ownerId}`,
    email: ownerUser?.email?.toLowerCase() ?? "",
    outreachUserId: ownerId,
    hubspotOwnerId: null,
  };
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

/**
 * CIO's `assigned_bdr_*` attributes resolved against Outreach's live user
 * list. Email first: it is the attribute humans and `cio:repair` edit, and
 * the id is only ever a copy of it — so a hand-corrected email wins over a
 * stale id rather than being reverted.
 */
export async function resolveCioAssignedOutreachUser(
  outreachUserId: string | null,
  email: string | null,
): Promise<{
  id: string;
  name: string;
  email: string | null;
} | null> {
  if (email) {
    const byEmail = await getOutreachUserByEmail(email);
    if (byEmail) return byEmail;
  }
  if (outreachUserId) {
    return await getOutreachUserById(outreachUserId);
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
