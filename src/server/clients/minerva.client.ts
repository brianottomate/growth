import "server-only";
import { env } from "@/env";

// =====================================================
// CLIENT INITIALIZATION
// =====================================================

/**
 * Minerva client for lead enrichment data.
 *
 * Minerva is a lead enrichment service that provides:
 * - Location data (city, state, zip from IP geolocation)
 * - Household income estimation (estimated_income_range)
 * - Phone number enrichment (last-resort fallback in the enrichment chain)
 *
 * In the Python growth API, Minerva is used for:
 * 1. Phone enrichment: BigQuery → webhook → CIO → **Minerva** (last resort)
 * 2. Income backfill: Daily cron updates Outreach custom38 from Minerva data
 * 3. Location enrichment: Populates Outreach custom33 with city/state/zip
 *
 * Reference: wander-growth-api/app/services/ (Minerva enrichment endpoints)
 */

export const isMinervaConfigured =
  !!env.MINERVA_API_KEY;

if (!isMinervaConfigured) {
  console.warn(
    "⚠️ [Minerva] Not configured. Need MINERVA_API_KEY",
  );
}

// =====================================================
// TYPES
// =====================================================

export interface MinervaEnrichmentResult {
  email: string;
  phone?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  estimatedIncomeRange?: string;
  confidenceScore?: number;
}

interface MinervaEnrichRecordInput {
  record_id: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  emails?: string[];
  phones?: string[];
  minerva_pid?: string;
  linkedin_url?: string;
}

interface MinervaEnrichRequest {
  records: MinervaEnrichRecordInput[];
  match_condition_fields?: string[];
  return_fields?: string[];
}

interface MinervaPhone {
  phone_rank?: number;
  phone_type?: string;
  phone_number?: string;
}

interface MinervaAddress {
  address_rank?: number;
  address_city?: string;
  address_state?: string;
  address_zipcode?: string;
}

interface MinervaEnrichResult {
  record_id: string;
  is_match: boolean;
  minerva_pid?: string;
  match_score?: number;
  validation_errors?: Record<string, unknown> | null;
  phones?: MinervaPhone[];
  address_history?: MinervaAddress[];
  financial_information?: {
    estimated_income_range?: string;
  };
}

interface MinervaEnrichResponse {
  api_request_id?: string;
  results?: MinervaEnrichResult[];
  request_completed_at?: string;
}

interface MinervaResolveRecordInput {
  record_id?: string;
  emails?: string[];
  phones?: string[];
  first_name?: string;
  last_name?: string;
  full_name?: string;
}

interface MinervaResolveRequest {
  records: MinervaResolveRecordInput[];
  match_condition_fields?: string[];
}

interface MinervaResolveResult {
  record_id?: string | null;
  is_match: boolean;
  minerva_pid?: string | null;
  linkedin_url?: string | null;
  match_score?: number | null;
  is_resolvable_record?: boolean;
  validation_errors?: Record<string, unknown> | null;
}

interface MinervaResolveResponse {
  api_request_id?: string;
  results?: MinervaResolveResult[];
  request_completed_at?: string;
}

export interface MinervaEnrichDebugResult {
  apiRequestId: string | null;
  requestCompletedAt: string | null;
  result: {
    recordId: string | null;
    isMatch: boolean;
    minervaPid: string | null;
    matchScore: number | null;
    validationErrors: Record<string, unknown> | null;
    phoneCount: number;
    topPhone: string | null;
    addressCount: number;
    topCity: string | null;
    topState: string | null;
    estimatedIncomeRange: string | null;
  } | null;
}

const DEFAULT_RETURN_FIELDS = [
  "estimated_income_range",
  "phones",
  "address_history",
];

function getMinervaBaseUrl(): string {
  return (env.MINERVA_API_URL ?? "https://api.minerva.io").replace(/\/+$/, "");
}

function normalizeScore(score: number | undefined): number | undefined {
  if (score == null || Number.isNaN(score)) return undefined;
  // Docs mention 0-1 scale; examples also show 0-100 style values.
  return score > 1 ? score / 100 : score;
}

function getTopPhone(phones: MinervaPhone[] | undefined): string | undefined {
  if (!phones || phones.length === 0) return undefined;
  const sorted = [...phones].sort(
    (a, b) => (a.phone_rank ?? 999) - (b.phone_rank ?? 999),
  );
  return sorted[0]?.phone_number ?? undefined;
}

function getTopAddress(
  addresses: MinervaAddress[] | undefined,
): MinervaAddress | undefined {
  if (!addresses || addresses.length === 0) return undefined;
  const sorted = [...addresses].sort(
    (a, b) => (a.address_rank ?? 999) - (b.address_rank ?? 999),
  );
  return sorted[0];
}

async function postEnrichV2(
  body: MinervaEnrichRequest,
): Promise<MinervaEnrichResponse> {
  if (!env.MINERVA_API_KEY) {
    throw new Error("Minerva API key missing");
  }

  const response = await fetch(`${getMinervaBaseUrl()}/v2/enrich`, {
    method: "POST",
    headers: {
      "x-api-key": env.MINERVA_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(
      `Minerva /v2/enrich failed (${response.status}): ${details.slice(0, 500)}`,
    );
  }

  return (await response.json()) as MinervaEnrichResponse;
}

async function postResolveV2(
  body: MinervaResolveRequest,
): Promise<MinervaResolveResponse> {
  if (!env.MINERVA_API_KEY) {
    throw new Error("Minerva API key missing");
  }

  const response = await fetch(`${getMinervaBaseUrl()}/v2/resolve`, {
    method: "POST",
    headers: {
      "x-api-key": env.MINERVA_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(
      `Minerva /v2/resolve failed (${response.status}): ${details.slice(0, 500)}`,
    );
  }

  return (await response.json()) as MinervaResolveResponse;
}

// =====================================================
// STUB: Enrichment functions
// =====================================================

/**
 * Enrich a lead by email address.
 *
 * Returns location, phone, and income data when available.
 */
export async function enrichByEmail(
  email: string,
): Promise<MinervaEnrichmentResult | null> {
  if (!isMinervaConfigured) return null;

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return null;

  try {
    const resolveData = await postResolveV2({
      records: [{ record_id: normalizedEmail, emails: [normalizedEmail] }],
    });
    const resolveResult = resolveData.results?.[0];
    const pid = resolveResult?.is_match ? resolveResult.minerva_pid : null;
    if (!pid) return null;

    const enrichPayload: MinervaEnrichRequest = {
      records: [{ record_id: normalizedEmail, minerva_pid: pid }],
      return_fields: DEFAULT_RETURN_FIELDS,
    };

    const data = await postEnrichV2(enrichPayload);
    const result = data.results?.[0];
    if (!result?.is_match) return null;

    const topAddress = getTopAddress(result.address_history);

    return {
      email: normalizedEmail,
      phone: getTopPhone(result.phones),
      city: topAddress?.address_city,
      state: topAddress?.address_state,
      postalCode: topAddress?.address_zipcode,
      estimatedIncomeRange:
        result.financial_information?.estimated_income_range ?? undefined,
      confidenceScore: normalizeScore(result.match_score),
    };
  } catch (error) {
    console.error("❌ [Minerva] enrichByEmail failed:", error);
    return null;
  }
}

/**
 * Enrich phone number for a lead (last-resort fallback).
 *
 * Called when BigQuery, webhook, and CIO all lack a phone number.
 * Used in the real-time sync pipeline phone enrichment chain.
 */
export async function enrichPhone(
  email: string,
): Promise<string | null> {
  if (!isMinervaConfigured) return null;

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return null;

  try {
    const resolveData = await postResolveV2({
      records: [{ record_id: normalizedEmail, emails: [normalizedEmail] }],
    });
    const resolveResult = resolveData.results?.[0];
    const pid = resolveResult?.is_match ? resolveResult.minerva_pid : null;
    if (!pid) return null;

    const payload: MinervaEnrichRequest = {
      records: [{ record_id: normalizedEmail, minerva_pid: pid }],
      match_condition_fields: ["phone"],
      return_fields: ["phones"],
    };
    const data = await postEnrichV2(payload);
    const result = data.results?.[0];
    if (!result?.is_match) return null;
    return getTopPhone(result.phones) ?? null;
  } catch (error) {
    console.error("❌ [Minerva] enrichPhone failed:", error);
    return null;
  }
}

/**
 * Batch enrich income data for Outreach backfill.
 *
 * Used by the daily `minerva_income_backfill_daily` cron job to update
 * Outreach custom38 (household_income) from Minerva's estimated_income_range.
 *
 * Reference: wander-growth-api minerva-income-backfill endpoint
 */
export async function batchEnrichIncome(
  emails: string[],
): Promise<
  Array<{ email: string; estimatedIncomeRange: string | null }>
> {
  if (!isMinervaConfigured) return [];

  const normalizedEmails = [...new Set(emails.map((e) => e.trim().toLowerCase()))]
    .filter(Boolean);
  if (normalizedEmails.length === 0) return [];

  const output: Array<{ email: string; estimatedIncomeRange: string | null }> =
    [];

  // Minerva v2 enrich max 500 records per request.
  for (let i = 0; i < normalizedEmails.length; i += 500) {
    const chunk = normalizedEmails.slice(i, i + 500);

    try {
      const resolveData = await postResolveV2({
        records: chunk.map((emailValue) => ({
          record_id: emailValue,
          emails: [emailValue],
        })),
      });
      const matchedByEmail = new Map<string, string>();
      for (const r of resolveData.results ?? []) {
        if (r.record_id && r.is_match && r.minerva_pid) {
          matchedByEmail.set(String(r.record_id), r.minerva_pid);
        }
      }

      const payload: MinervaEnrichRequest = {
        records: chunk
          .filter((emailValue) => matchedByEmail.has(emailValue))
          .map((emailValue) => ({
            record_id: emailValue,
            minerva_pid: matchedByEmail.get(emailValue),
          })),
        return_fields: ["estimated_income_range"],
      };

      const data =
        payload.records.length > 0
          ? await postEnrichV2(payload)
          : { results: [] as MinervaEnrichResult[] };
      const byRecordId = new Map(
        (data.results ?? []).map((result) => [result.record_id, result]),
      );

      for (const emailValue of chunk) {
        const result = byRecordId.get(emailValue);
        output.push({
          email: emailValue,
          estimatedIncomeRange:
            result?.is_match
              ? (result.financial_information?.estimated_income_range ?? null)
              : null,
        });
      }
    } catch (error) {
      console.error("❌ [Minerva] batchEnrichIncome chunk failed:", error);
      for (const emailValue of chunk) {
        output.push({ email: emailValue, estimatedIncomeRange: null });
      }
    }
  }

  return output;
}

/**
 * Debug helper for testing Minerva matching behavior by email.
 * Includes raw match metadata and validation hints.
 */
export async function enrichDebugByEmail(
  email: string,
): Promise<MinervaEnrichDebugResult | null> {
  if (!isMinervaConfigured) return null;

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return null;

  try {
    const resolveData = await postResolveV2({
      records: [{ record_id: normalizedEmail, emails: [normalizedEmail] }],
    });
    const resolveResult = resolveData.results?.[0];
    const pid = resolveResult?.is_match ? resolveResult.minerva_pid : null;

    if (!pid) {
      return {
        apiRequestId: resolveData.api_request_id ?? null,
        requestCompletedAt: resolveData.request_completed_at ?? null,
        result: {
          recordId: resolveResult?.record_id ?? normalizedEmail,
          isMatch: !!resolveResult?.is_match,
          minervaPid: resolveResult?.minerva_pid ?? null,
          matchScore: resolveResult?.match_score ?? null,
          validationErrors: resolveResult?.validation_errors ?? null,
          phoneCount: 0,
          topPhone: null,
          addressCount: 0,
          topCity: null,
          topState: null,
          estimatedIncomeRange: null,
        },
      };
    }

    const payload: MinervaEnrichRequest = {
      records: [{ record_id: normalizedEmail, minerva_pid: pid }],
      return_fields: DEFAULT_RETURN_FIELDS,
    };

    const data = await postEnrichV2(payload);
    const result = data.results?.[0];
    const topAddress = getTopAddress(result?.address_history);
    const topPhone = getTopPhone(result?.phones);

    return {
      apiRequestId: data.api_request_id ?? null,
      requestCompletedAt: data.request_completed_at ?? null,
      result: result
        ? {
            recordId: result.record_id ?? null,
            isMatch: !!result.is_match,
            minervaPid: result.minerva_pid ?? null,
            matchScore: result.match_score ?? null,
            validationErrors: result.validation_errors ?? null,
            phoneCount: result.phones?.length ?? 0,
            topPhone: topPhone ?? null,
            addressCount: result.address_history?.length ?? 0,
            topCity: topAddress?.address_city ?? null,
            topState: topAddress?.address_state ?? null,
            estimatedIncomeRange:
              result.financial_information?.estimated_income_range ?? null,
          }
        : null,
    };
  } catch (error) {
    console.error("❌ [Minerva] enrichDebugByEmail failed:", error);
    return null;
  }
}
