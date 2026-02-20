import { NextResponse } from "next/server";
import { env } from "@/env";
import {
  fetchLeadForRealtimeSync,
  type RealtimeLeadData,
} from "@/server/clients/bigquery.client";
import { getCustomerByEmail } from "@/server/clients/customerio.client";
import {
  searchProspectByEmail,
  getUsers,
  isOutreachConfigured,
} from "@/server/clients/outreach.client";
import {
  mapLeadToOutreachFields,
  buildCreatePayload,
  buildUpdatePayload,
  buildTags,
  type LeadData,
} from "@/server/services/outreach/field-mapping";
import {
  getNextBdr,
  getNextBdrFromOutreachLoadDetailed,
  getAssignmentStats,
  resetRoundRobin,
} from "@/server/services/outreach/bdr-assignment.service";
import {
  enrichByEmail as enrichFromMinerva,
  isMinervaConfigured,
} from "@/server/clients/minerva.client";

interface StepResult {
  step: string;
  status: "ok" | "skipped" | "failed" | "warning";
  durationMs: number;
  data?: unknown;
  error?: string;
}

function buildLeadFromCio(
  cioData: NonNullable<Awaited<ReturnType<typeof getCustomerByEmail>>>,
): LeadData {
  const attrs = cioData.attributes;
  return {
    id_user: cioData.id,
    email: cioData.email,
    phone: (attrs.phone as string) ?? null,
    first_name: (attrs.first_name as string) ?? null,
    last_name: (attrs.last_name as string) ?? null,
    full_name:
      (attrs.full_name as string) ??
      ([attrs.first_name, attrs.last_name].filter(Boolean).join(" ") || null),
    city: (attrs.city as string) ?? null,
    state: (attrs.state as string) ?? null,
    country: (attrs.country as string) ?? null,
    ...({
      assignedBdrEmail: cioData.assignedBdrEmail,
      assignedBdrName: cioData.assignedBdrName,
      assignedBdrOutreachId: cioData.assignedBdrOutreachId,
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
    "last_checkout_property",
    "last_activity_type",
    "last_activity_ts",
    "last_activity_property_name",
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
  title: string | null;
} | null> {
  const users = await getUsers({ pageSize: 100 });
  const user = users.data.find((u) => String(u.id) === outreachUserId);
  if (!user) return null;
  return {
    id: String(user.id),
    name: user.attributes.name,
    email: user.attributes.email ?? null,
    title: user.attributes.title ?? null,
  };
}

async function getOutreachUserByEmail(email: string): Promise<{
  id: string;
  name: string;
  email: string | null;
  title: string | null;
} | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const users = await getUsers({ pageSize: 100 });
  const user = users.data.find(
    (u) => (u.attributes.email ?? "").toLowerCase() === normalized,
  );
  if (!user) return null;
  return {
    id: String(user.id),
    name: user.attributes.name,
    email: user.attributes.email ?? null,
    title: user.attributes.title ?? null,
  };
}

async function resolveCioAssignedOutreachUser(
  outreachUserId: string | null,
  email: string | null,
): Promise<{
  id: string;
  name: string;
  email: string | null;
  title: string | null;
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
 * Dry-run sync pipeline — simulates a CIO webhook end-to-end
 *
 * GET /api/test/workflows/cio-to-outreach?email=user@example.com
 * GET /api/test/workflows/cio-to-outreach?email=user@example.com&event=payment_info_entered
 * GET /api/test/workflows/cio-to-outreach?email=user@example.com&property=Wander+Broken+Bow
 *
 * Runs every stage of the pipeline but does NOT write to Outreach or CIO.
 * Returns the result of each stage so you can see exactly where things work/fail.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");
  const eventType = searchParams.get("event") ?? "checkout_started";
  const propertyName = searchParams.get("property") ?? undefined;

  if (!email) {
    return NextResponse.json(
      {
        error: "Missing ?email= parameter",
        usage:
          "/api/test/workflows/cio-to-outreach?email=user@example.com&event=checkout_started&property=Wander+Broken+Bow",
        supportedEvents: [
          "checkout_started",
          "payment_info_entered",
          "user_signed_up",
          "order_completed",
        ],
      },
      { status: 400 },
    );
  }

  const totalStartMs = Date.now();
  const steps: StepResult[] = [];

  // Simulated webhook payload
  const webhookPayload = {
    event_type: eventType,
    data: {
      email,
      property_name: propertyName,
    },
  };

  // -----------------------------------------------
  // Step 1: BigQuery lead enrichment
  // -----------------------------------------------
  let bqData: RealtimeLeadData | null = null;
  {
    const stepStart = Date.now();
    try {
      bqData = await fetchLeadForRealtimeSync({
        email,
        eventType,
        propertyName,
      });
      if (env.SYNC_DEBUG) {
        console.debug(
          "🧪 [Workflow] BigQuery raw\n%s",
          JSON.stringify(bqData, null, 2),
        );
      }
      steps.push({
        step: "1_bigquery_fetch",
        status: bqData ? "ok" : "warning",
        durationMs: Date.now() - stepStart,
        data: bqData
          ? {
              id_user: bqData.id_user,
              email: bqData.email,
              phone: bqData.phone,
              name: bqData.full_name,
              city: bqData.city,
              state: bqData.state,
              country: bqData.country,
              event_types: bqData.event_types,
              interacted_properties: bqData.interacted_properties,
              unique_properties: bqData.unique_properties,
              checkout_count: bqData.checkout_count,
              payment_count: bqData.payment_count,
              last_checkout_property: bqData.last_checkout_property,
              count_confirmed_bookings: bqData.count_confirmed_bookings,
              total_spend: bqData.total_spend,
              last_booking_date: bqData.last_booking_date,
              last_booked_property_name: bqData.last_booked_property_name,
              minerva_rank: bqData.minerva_rank,
              flag_has_minerva_score: bqData.flag_has_minerva_score,
              review_count: bqData.review_count,
              avg_review_score: bqData.avg_review_score,
              wishlisted_properties: bqData.wishlisted_properties,
            }
          : "No data found for this email in BigQuery",
      });
    } catch (e) {
      steps.push({
        step: "1_bigquery_fetch",
        status: "failed",
        durationMs: Date.now() - stepStart,
        error: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }

  // -----------------------------------------------
  // Step 2: CIO customer lookup
  // -----------------------------------------------
  let cioData: Awaited<ReturnType<typeof getCustomerByEmail>> = null;
  {
    const stepStart = Date.now();
    try {
      cioData = await getCustomerByEmail(email);
      if (cioData) {
        const attrs = cioData.attributes;
        const interestingAttributeKeys = [
          "phone",
          "first_name",
          "last_name",
          "full_name",
          "city",
          "state",
          "country",
          "count_confirmed_bookings",
          "total_spend",
          "minerva_rank",
          "assigned_bdr_email",
          "assigned_bdr_name",
        ];
        const interestingAttributes = Object.fromEntries(
          interestingAttributeKeys
            .filter((k) => attrs[k] != null)
            .map((k) => [k, attrs[k]]),
        );
        if (env.SYNC_DEBUG) {
          console.debug(
            "🧪 [Workflow] Customer.io raw\n%s",
            JSON.stringify(
              {
                ...cioData,
                attributeCount: Object.keys(attrs).length,
                interestingAttributes,
              },
              null,
              2,
            ),
          );
        }
      } else {
        if (env.SYNC_DEBUG) {
          console.debug(
            "🧪 [Workflow] Customer.io raw\n%s",
            JSON.stringify({ found: false, email }, null, 2),
          );
        }
      }
      steps.push({
        step: "2_cio_fetch",
        status: cioData ? "ok" : "warning",
        durationMs: Date.now() - stepStart,
        data: cioData
          ? {
              id: cioData.id,
              email: cioData.email,
              assignedBdrEmail: cioData.assignedBdrEmail,
              assignedBdrName: cioData.assignedBdrName,
              attributeCount: Object.keys(cioData.attributes).length,
              sampleAttributes: Object.fromEntries(
                Object.entries(cioData.attributes).slice(0, 10),
              ),
            }
          : "No customer found in CIO for this email",
      });
    } catch (e) {
      steps.push({
        step: "2_cio_fetch",
        status: "failed",
        durationMs: Date.now() - stepStart,
        error: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }

  // -----------------------------------------------
  // Step 2b: Minerva enrichment lookup
  // -----------------------------------------------
  let minervaData: Awaited<ReturnType<typeof enrichFromMinerva>> = null;
  {
    const stepStart = Date.now();
    if (!isMinervaConfigured) {
      steps.push({
        step: "2b_minerva_fetch",
        status: "skipped",
        durationMs: 0,
        data: "Minerva not configured",
      });
    } else {
      try {
        minervaData = await enrichFromMinerva(email);
        if (env.SYNC_DEBUG) {
          console.debug(
            "🧪 [Workflow] Minerva raw\n%s",
            JSON.stringify(minervaData ?? { found: false, email }, null, 2),
          );
        }
        steps.push({
          step: "2b_minerva_fetch",
          status: minervaData ? "ok" : "warning",
          durationMs: Date.now() - stepStart,
          data: minervaData
            ? {
                email: minervaData.email,
                phone: minervaData.phone ?? null,
                city: minervaData.city ?? null,
                state: minervaData.state ?? null,
                country: minervaData.country ?? null,
                postalCode: minervaData.postalCode ?? null,
                estimatedIncomeRange: minervaData.estimatedIncomeRange ?? null,
                confidenceScore: minervaData.confidenceScore ?? null,
              }
            : "No enrichment match for this email in Minerva",
        });
      } catch (e) {
        steps.push({
          step: "2b_minerva_fetch",
          status: "failed",
          durationMs: Date.now() - stepStart,
          error: e instanceof Error ? e.message : "Unknown error",
        });
      }
    }
  }

  // -----------------------------------------------
  // Step 3: Normalize to LeadData
  // -----------------------------------------------
  let leadData: LeadData;
  {
    let dataSource: "bigquery" | "customerio" | "bigquery+customerio" | "webhook";
    let filledFromCio: string[] = [];
    const filledFromMinerva: string[] = [];
    const cioLead = cioData ? buildLeadFromCio(cioData) : null;

    if (bqData && cioLead) {
      dataSource = "bigquery+customerio";
      const bqRecord = bqData as unknown as Record<string, unknown>;
      const cioRecord = cioLead as Record<string, unknown>;
      filledFromCio = Object.keys(cioRecord).filter(
        (key) => bqRecord[key] == null && cioRecord[key] != null,
      );
      leadData = mergeLeadData(bqData as LeadData, cioLead);
    } else if (bqData) {
      dataSource = "bigquery";
      leadData = bqData as LeadData;
    } else if (cioLead) {
      dataSource = "customerio";
      leadData = cioLead;
    } else {
      dataSource = "webhook";
      leadData = { email };
    }

    leadData.webhook_event_type = eventType;
    if (propertyName) leadData.webhook_property_name = propertyName;

    const hadSourcePhone = !!leadData.phone;

    // Minerva enrichment backfill
    if (minervaData) {
      if (!leadData.phone && minervaData.phone) {
        leadData.phone = minervaData.phone;
        filledFromMinerva.push("phone");
      }
      if (!leadData.city && minervaData.city) {
        leadData.city = minervaData.city;
        filledFromMinerva.push("city");
      }
      if (!leadData.state && minervaData.state) {
        leadData.state = minervaData.state;
        filledFromMinerva.push("state");
      }
      if (!leadData.country && minervaData.country) {
        leadData.country = minervaData.country;
        filledFromMinerva.push("country");
      }
      if (!leadData.minerva_household_income && minervaData.estimatedIncomeRange) {
        leadData.minerva_household_income = minervaData.estimatedIncomeRange;
        filledFromMinerva.push("minerva_household_income");
      }
    }

    // Phone final fallback from webhook payload
    const webhookPhone = (webhookPayload.data as Record<string, unknown>)
      .phone as string | undefined;
    leadData.phone = leadData.phone ?? webhookPhone ?? null;
    if (env.SYNC_DEBUG) {
      console.debug(
        "🧪 [Workflow] Merge result\n%s",
        JSON.stringify(
          {
            dataSource,
            filledFromCio,
            filledFromMinerva,
            merged: leadData,
          },
          null,
          2,
        ),
      );
    }

    steps.push({
      step: "3_normalize_lead",
      status: "ok",
      durationMs: 0,
      data: {
        dataSource,
        email: leadData.email,
        name:
          (leadData.full_name ??
            `${leadData.first_name ?? ""} ${leadData.last_name ?? ""}`.trim()) ||
          null,
        phone: leadData.phone,
        phoneSource: hadSourcePhone
          ? "bigquery/cio"
          : filledFromMinerva.includes("phone")
            ? "minerva"
          : webhookPhone
            ? "webhook"
            : "none",
        city: leadData.city,
        state: leadData.state,
        country: leadData.country,
        id_user: leadData.id_user,
        minervaBackfilled: filledFromMinerva,
      },
    });
  }

  // -----------------------------------------------
  // Step 4: Field mapping
  // -----------------------------------------------
  let mappedFields: Record<string, string | null>;
  let tags: string[];
  {
    try {
      mappedFields = mapLeadToOutreachFields(leadData);
      tags = buildTags(leadData);

      // Count non-null fields
      const populatedFields = Object.entries(mappedFields).filter(
        ([, v]) => v != null,
      );

      steps.push({
        step: "4_field_mapping",
        status: "ok",
        durationMs: 0,
        data: {
          totalMappedFields: populatedFields.length,
          tags,
          fields: Object.fromEntries(populatedFields),
        },
      });
    } catch (e) {
      mappedFields = {};
      tags = [];
      steps.push({
        step: "4_field_mapping",
        status: "failed",
        durationMs: 0,
        error: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }

  // -----------------------------------------------
  // Step 5: Build Outreach payload (dry run)
  // -----------------------------------------------
  {
    try {
      const createPayload = buildCreatePayload(leadData);
      const updatePayload = buildUpdatePayload(leadData, []);
      console.log(
        `🧪 [Workflow] Would write Outreach payload for ${email}: createFields=${Object.keys(createPayload.attributes).length}, updateFields=${Object.keys(updatePayload.attributes).length}`,
      );
      if (env.SYNC_DEBUG) {
        console.debug(
          "🧪 [Workflow] Outreach write details\n%s",
          JSON.stringify(
            {
              create: {
                stageId: createPayload.stageId,
                attributes: createPayload.attributes,
              },
              update: {
                stageId: updatePayload.stageId ?? "no change",
                attributes: updatePayload.attributes,
              },
            },
            null,
            2,
          ),
        );
      }

      steps.push({
        step: "5_outreach_payload",
        status: "ok",
        durationMs: 0,
        data: {
          createPayload: {
            stageId: createPayload.stageId,
            attributeCount: Object.keys(createPayload.attributes).length,
            standardFields: {
              firstName: createPayload.attributes.firstName,
              lastName: createPayload.attributes.lastName,
              emails: createPayload.attributes.emails,
              addressCity: createPayload.attributes.addressCity,
              addressState: createPayload.attributes.addressState,
              mobilePhones: createPayload.attributes.mobilePhones,
              tags: createPayload.attributes.tags,
            },
            customFields: Object.fromEntries(
              Object.entries(createPayload.attributes).filter(([k]) =>
                k.startsWith("custom"),
              ),
            ),
          },
          updatePayload: {
            stageId: updatePayload.stageId ?? "no change",
            attributeCount: Object.keys(updatePayload.attributes).length,
            fields: updatePayload.attributes,
          },
        },
      });
    } catch (e) {
      steps.push({
        step: "5_outreach_payload",
        status: "failed",
        durationMs: 0,
        error: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }

  let outreachProspect: Awaited<ReturnType<typeof searchProspectByEmail>> = null;

  // -----------------------------------------------
  // Step 6: Outreach prospect search (real API call, read-only)
  // -----------------------------------------------
  {
    const stepStart = Date.now();
    if (!isOutreachConfigured) {
      steps.push({
        step: "6_outreach_search",
        status: "skipped",
        durationMs: 0,
        error: "Outreach not configured",
      });
    } else {
      try {
        outreachProspect = await searchProspectByEmail(email);
        const existingOwnerId = outreachProspect
          ? getProspectOwnerId(outreachProspect)
          : null;
        const existingOwner = existingOwnerId
          ? await getOutreachUserById(existingOwnerId)
          : null;

        steps.push({
          step: "6_outreach_search",
          status: "ok",
          durationMs: Date.now() - stepStart,
          data: outreachProspect
            ? {
                exists: true,
                id: outreachProspect.id,
                name: outreachProspect.attributes.name,
                emails: outreachProspect.attributes.emails,
                tags: outreachProspect.attributes.tags?.slice(0, 10),
                currentSyncCount: outreachProspect.attributes.custom51,
                lastSyncTag: outreachProspect.attributes.custom50,
                lastEventType: outreachProspect.attributes.custom52,
                owner: existingOwner
                  ? {
                      outreachUserId: existingOwner.id,
                      name: existingOwner.name,
                      email: existingOwner.email,
                    }
                  : existingOwnerId
                    ? { outreachUserId: existingOwnerId, unresolved: true }
                    : null,
                wouldPerform: "UPDATE (PATCH /prospects/" + outreachProspect.id + ")",
              }
            : {
                exists: false,
                wouldPerform: "CREATE (POST /prospects)",
              },
        });
      } catch (e) {
        steps.push({
          step: "6_outreach_search",
          status: "failed",
          durationMs: Date.now() - stepStart,
          error: e instanceof Error ? e.message : "Unknown error",
        });
      }
    }
  }

  // -----------------------------------------------
  // Step 7: BDR assignment (Outreach owner parity)
  // -----------------------------------------------
  {
    const stepStart = Date.now();
    const hasPhone = !!leadData.phone;
    const cioAssignedEmail = ((leadData as Record<string, unknown>)
      .assignedBdrEmail as string | null)?.toLowerCase() ?? null;
    const cioAssignedOutreachId = ((leadData as Record<string, unknown>)
      .assignedBdrOutreachId as string | null) ?? null;

    let bdr:
      | {
          name: string;
          email: string;
          outreachUserId: string;
        }
      | null = null;
    let source:
      | "outreach_owner"
      | "cio_existing"
      | "outreach_load"
      | "static_round_robin"
      | "none" = "none";
    let whySelected: Record<string, unknown> | null = null;

    const ownerId = outreachProspect ? getProspectOwnerId(outreachProspect) : null;
    if (ownerId) {
      const owner = await getOutreachUserById(ownerId);
      bdr = {
        name: owner?.name ?? `Outreach User ${ownerId}`,
        email: (owner?.email ?? "").toLowerCase(),
        outreachUserId: ownerId,
      };
      source = "outreach_owner";
      whySelected = {
        reason: "Existing Outreach owner preserved (source of truth)",
        ownerResolved: !!owner,
      };
    }

    if (!bdr) {
      const existing = await resolveCioAssignedOutreachUser(
        cioAssignedOutreachId,
        cioAssignedEmail,
      );
      if (existing) {
        bdr = {
          name: existing.name,
          email: (existing.email ?? "").toLowerCase(),
          outreachUserId: existing.id,
        };
        source = "cio_existing";
        whySelected = {
          reason:
            "No Outreach owner found; reused existing CIO assignment resolved against Outreach users",
        };
      }
    }

    if (!bdr) {
      const dynamicSelection = await getNextBdrFromOutreachLoadDetailed(hasPhone);
      if (dynamicSelection.assignedBdr) {
        bdr = {
          name: dynamicSelection.assignedBdr.name,
          email: dynamicSelection.assignedBdr.email,
          outreachUserId: dynamicSelection.assignedBdr.outreachUserId,
        };
        source = "outreach_load";
        whySelected = {
          reason: dynamicSelection.reason,
          selectedLoad: dynamicSelection.selectedLoad,
          candidateCounts: {
            total: dynamicSelection.totalCandidates,
            eligibleWithLoad: dynamicSelection.eligibleCandidates,
          },
          topCandidates: dynamicSelection.topCandidates,
        };
      } else {
        resetRoundRobin();
        const fallback = getNextBdr(hasPhone);
        resetRoundRobin();
        if (fallback) {
          bdr = {
            name: fallback.name,
            email: fallback.email,
            outreachUserId: fallback.outreachUserId,
          };
          source = "static_round_robin";
          whySelected = {
            reason:
              "Dynamic load selection unavailable; fell back to static round-robin",
          };
        }
      }
    }

    const cioParity = bdr
      ? {
          cioAssignedEmail,
          cioAssignedOutreachId,
          wouldWriteBack:
            cioAssignedOutreachId !== bdr.outreachUserId ||
            cioAssignedEmail !== bdr.email.toLowerCase(),
        }
      : null;

    steps.push({
      step: "7_bdr_assignment",
      status: bdr ? "ok" : "warning",
      durationMs: Date.now() - stepStart,
      data: bdr
        ? {
            assignedBdr: bdr,
            source,
            pool: hasPhone ? "email+phone" : "email-only",
            whySelected,
            cioParity,
          }
        : {
            message:
              "No active BDR could be selected from Outreach or static roster",
            rosterStats: getAssignmentStats(),
          },
    });
  }

  // -----------------------------------------------
  // Summary
  // -----------------------------------------------
  const totalDurationMs = Date.now() - totalStartMs;
  const okCount = steps.filter((s) => s.status === "ok").length;
  const failCount = steps.filter((s) => s.status === "failed").length;
  const skipCount = steps.filter((s) => s.status === "skipped").length;
  const warnCount = steps.filter((s) => s.status === "warning").length;

  return NextResponse.json({
    dryRun: true,
    email,
    eventType,
    propertyName: propertyName ?? null,
    webhookPayload,
    totalDurationMs,
    summary: {
      ok: okCount,
      failed: failCount,
      skipped: skipCount,
      warnings: warnCount,
      verdict:
        failCount > 0
          ? "PIPELINE HAS FAILURES"
          : warnCount > 0
            ? "PIPELINE OK WITH WARNINGS"
            : "PIPELINE READY",
    },
    steps,
  });
}
