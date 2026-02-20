import "server-only";
import { TrackClient, APIClient, RegionUS } from "customerio-node";
import { env } from "@/env";

// =====================================================
// CLIENT INITIALIZATION
// =====================================================

/**
 * Customer.io has three API surfaces:
 *
 * 1. **App API** (reads) — Bearer auth with App API Key
 *    Search customers, get attributes, get activities
 *
 * 2. **Track API** (writes) — Basic auth with Site ID + API Key
 *    Identify/update customers, track events
 *
 * 3. **Entity API v2** (relationships) — Basic auth with Site ID + API Key
 *    Manage object relationships (e.g., BDR assignments)
 *
 * Rate limit: 10 requests/second across all APIs.
 *
 * Reference: wander-growth-api/app/services/CustomerIO/customer_client.py
 */

// SDK instances — use these directly for operations covered by the SDK
export const trackClient = new TrackClient(
  env.CUSTOMER_IO_SITE_ID,
  env.CUSTOMER_IO_API_KEY,
  {
    region: RegionUS,
  },
);

export const apiClient = new APIClient(env.CUSTOMER_IO_APP_KEY, {
  region: RegionUS,
});

// =====================================================
// CONSTANTS
// =====================================================

const APP_API_BASE = "https://api.customer.io/v1";
const TRACK_API_BASE = "https://track.customer.io/api/v1";
const ENTITY_API_BASE = "https://track.customer.io/api/v2";

// =====================================================
// AUTH HELPERS
// =====================================================

function getAppApiHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${env.CUSTOMER_IO_APP_KEY}`,
    "Content-Type": "application/json",
  };
}

function getTrackApiHeaders(): Record<string, string> {
  const auth = Buffer.from(
    `${env.CUSTOMER_IO_SITE_ID}:${env.CUSTOMER_IO_API_KEY}`,
  ).toString("base64");
  return {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
  };
}

// =====================================================
// INTERNAL REQUEST HELPERS
// =====================================================

async function appApiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T | null> {
  const url = `${APP_API_BASE}${endpoint}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...getAppApiHeaders(),
        ...options.headers,
      },
    });

    if (response.ok) {
      return (await response.json()) as T;
    }

    if (response.status === 404) {
      return null;
    }

    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      console.warn(
        `⚠️ [CustomerIO] Rate limited. Retry after ${retryAfter ?? "60"}s`,
      );
      throw new CustomerIOError("Rate limited", {
        statusCode: 429,
        retryAfter: retryAfter ? parseInt(retryAfter) : 60,
      });
    }

    const errorText = await response.text();
    console.error(`❌ [CustomerIO] App API ${response.status}: ${errorText}`);
    throw new CustomerIOError(`App API request failed: ${response.status}`, {
      statusCode: response.status,
    });
  } catch (error) {
    if (error instanceof CustomerIOError) throw error;
    console.error("❌ [CustomerIO] App API request error:", error);
    throw new CustomerIOError(
      `App API request failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

async function _trackApiRequest(
  method: string,
  endpoint: string,
  body?: Record<string, unknown>,
): Promise<boolean> {
  const url = `${TRACK_API_BASE}${endpoint}`;

  try {
    const response = await fetch(url, {
      method,
      headers: getTrackApiHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });

    if (response.status === 200 || response.status === 204) {
      return true;
    }

    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      console.warn(
        `⚠️ [CustomerIO] Track API rate limited. Retry after ${retryAfter ?? "60"}s`,
      );
      throw new CustomerIOError("Rate limited", {
        statusCode: 429,
        retryAfter: retryAfter ? parseInt(retryAfter) : 60,
      });
    }

    const errorText = await response.text();
    console.error(`❌ [CustomerIO] Track API ${response.status}: ${errorText}`);
    return false;
  } catch (error) {
    if (error instanceof CustomerIOError) throw error;
    console.error("❌ [CustomerIO] Track API request error:", error);
    return false;
  }
}

async function entityApiRequest(
  payload: Record<string, unknown>,
): Promise<boolean> {
  const url = `${ENTITY_API_BASE}/entity`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: getTrackApiHeaders(),
      body: JSON.stringify(payload),
    });

    if (response.status < 400) {
      return true;
    }

    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      throw new CustomerIOError("Rate limited", {
        statusCode: 429,
        retryAfter: retryAfter ? parseInt(retryAfter) : 60,
      });
    }

    const errorText = await response.text();
    console.error(
      `❌ [CustomerIO] Entity API ${response.status}: ${errorText}`,
    );
    return false;
  } catch (error) {
    if (error instanceof CustomerIOError) throw error;
    console.error("❌ [CustomerIO] Entity API request error:", error);
    return false;
  }
}

// =====================================================
// READ OPERATIONS (App API)
// =====================================================

interface CustomerSearchResult {
  results: Array<{
    id: string;
    email: string;
    [key: string]: unknown;
  }>;
}

interface CustomerAttributes {
  customer: {
    id: string;
    attributes: Record<string, unknown>;
  };
}

interface CustomerActivitiesResponse {
  activities: Array<{
    type: string;
    name?: string;
    timestamp: number;
    [key: string]: unknown;
  }>;
}

/**
 * Search for a customer by email and return their full profile with attributes.
 *
 * This is the primary read function — mirrors the Python version's
 * `get_customer_by_email()` which fetches the customer then enriches
 * with attributes and BDR assignment data.
 */
export async function getCustomerByEmail(email: string) {
  const searchResult = await appApiRequest<CustomerSearchResult>(
    `/customers?email=${encodeURIComponent(email)}`,
  );

  if (!searchResult?.results?.length) {
    return null;
  }

  const customer = searchResult.results[0]!;
  const customerId = customer.id;

  // Fetch full attributes
  const attributeData = await getCustomerAttributes(customerId);

  const attributes = attributeData?.customer?.attributes ?? {};

  return {
    id: customerId,
    email: customer.email,
    attributes,
    // Convenience fields for BDR assignment (matches Python client)
    assignedBdrEmail: (attributes.assigned_bdr_email as string) ?? null,
    assignedBdrName: (attributes.assigned_bdr_name as string) ?? null,
    assignedBdrOutreachId:
      (attributes.assigned_bdr_outreach_id as string) ?? null,
  };
}

/**
 * Get customer attributes by Customer.io ID.
 */
export async function getCustomerAttributes(customerId: string) {
  return appApiRequest<CustomerAttributes>(
    `/customers/${encodeURIComponent(customerId)}/attributes`,
  );
}

/**
 * Get recent activities for a customer.
 *
 * Used to populate Outreach Custom Field 64 (CIO Activity Summary)
 * in the Python version.
 */
export async function getCustomerActivities(customerId: string, limit = 10) {
  const response = await appApiRequest<CustomerActivitiesResponse>(
    `/customers/${encodeURIComponent(customerId)}/activities?limit=${limit}`,
  );

  return response?.activities ?? [];
}

// =====================================================
// WRITE OPERATIONS (Track API)
// =====================================================

/**
 * Create or update a customer profile.
 *
 * Uses the Track API — the email is the identifier.
 * Any attributes passed will be set/updated on the profile.
 */
export async function identifyCustomer(
  email: string,
  attributes: Record<string, unknown>,
) {
  // The SDK's identify uses customer ID as first arg.
  // In Wander's setup, email is the identifier.
  await trackClient.identify(email, { email, ...attributes });
}

/**
 * Update customer attributes by email.
 *
 * This is an alias for identifyCustomer — in CIO, identify is an upsert.
 */
export async function updateCustomerAttributes(
  email: string,
  attributes: Record<string, unknown>,
) {
  return identifyCustomer(email, attributes);
}

/**
 * Update BDR assignment attributes for a customer.
 *
 * Sets assigned_bdr_email, assigned_bdr_name, assigned_bdr_outreach_id
 * on the customer profile. Mirrors the Python client's `update_bdr_assignment()`.
 */
export async function updateBdrAssignment(params: {
  customerEmail: string;
  bdrEmail: string;
  bdrName: string;
  bdrOutreachId: string;
}) {
  return updateCustomerAttributes(params.customerEmail, {
    assigned_bdr_email: params.bdrEmail,
    assigned_bdr_name: params.bdrName,
    assigned_bdr_outreach_id: params.bdrOutreachId,
  });
}

/**
 * Track a named event for a customer.
 */
export async function trackEvent(
  customerId: string,
  eventName: string,
  data?: Record<string, unknown>,
) {
  await trackClient.track(customerId, { name: eventName, data });
}

/**
 * Track an anonymous event (before the person is identified).
 */
export async function trackAnonymousEvent(
  anonymousId: string,
  eventName: string,
  data?: Record<string, unknown>,
) {
  await trackClient.trackAnonymous(anonymousId, {
    name: eventName,
    data,
  });
}

/**
 * Suppress a customer (stop all communications).
 */
export async function suppressCustomer(customerId: string) {
  await trackClient.suppress(customerId);
}

/**
 * Unsuppress a customer (re-enable communications).
 */
export async function unsuppressCustomer(customerId: string) {
  await trackClient.unsuppress(customerId);
}

// =====================================================
// ENTITY API V2 (Relationships)
// =====================================================

/**
 * Add a BDR relationship to a customer profile.
 *
 * Uses the Entity API v2 to create an object relationship.
 * object_type_id "4" is the BDR object type in Wander's CIO workspace.
 *
 * Reference: Python client's `add_bdr_relationship()`
 */
export async function addBdrRelationship(params: {
  customerId: string;
  bdrOutreachId: string;
  attributes?: Record<string, unknown>;
}) {
  const relationshipAttributes = params.attributes ?? {
    relationship_type: "bdr_assignment",
    updated_at: new Date().toISOString(),
  };

  return entityApiRequest({
    type: "person",
    identifiers: { id: params.customerId },
    action: "add_relationships",
    cio_relationships: [
      {
        identifiers: {
          object_type_id: "4",
          object_id: params.bdrOutreachId,
        },
        relationship_attributes: relationshipAttributes,
      },
    ],
  });
}

/**
 * Add a generic object relationship to a customer.
 *
 * More flexible than addBdrRelationship — lets you specify any object type.
 */
export async function addRelationship(params: {
  customerId: string;
  objectTypeId: string;
  objectId: string;
  attributes?: Record<string, unknown>;
}) {
  return entityApiRequest({
    type: "person",
    identifiers: { id: params.customerId },
    action: "add_relationships",
    cio_relationships: [
      {
        identifiers: {
          object_type_id: params.objectTypeId,
          object_id: params.objectId,
        },
        relationship_attributes: params.attributes ?? {},
      },
    ],
  });
}

/**
 * Remove a relationship from a customer.
 */
export async function removeRelationship(params: {
  customerId: string;
  objectTypeId: string;
  objectId: string;
}) {
  return entityApiRequest({
    type: "person",
    identifiers: { id: params.customerId },
    action: "remove_relationships",
    cio_relationships: [
      {
        identifiers: {
          object_type_id: params.objectTypeId,
          object_id: params.objectId,
        },
      },
    ],
  });
}

// =====================================================
// BROADCAST / CAMPAIGN OPERATIONS (App API)
// =====================================================

/**
 * Trigger an API-triggered broadcast.
 */
export async function triggerBroadcast(
  campaignId: number,
  data?: Record<string, unknown>,
  recipients?: { emails?: string[]; ids?: string[]; segment?: { id: number } },
) {
  return apiClient.triggerBroadcast(campaignId, data ?? {}, recipients ?? {});
}

// =====================================================
// WEBHOOK VERIFICATION
// =====================================================

/**
 * Verify a Customer.io webhook signature (HMAC-SHA256).
 *
 * CIO sends the signature in the `x-cio-signature` header.
 * The signature is computed as HMAC-SHA256(webhook_secret, raw_body).
 */
export async function verifyWebhookSignature(
  rawBody: ArrayBuffer | Uint8Array,
  signature: string,
): Promise<boolean> {
  const secret = env.CUSTOMERIO_WEBHOOK_SECRET;
  if (!secret) {
    console.warn(
      "⚠️ [CustomerIO] No webhook secret configured — skipping verification",
    );
    return true;
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const bodyBuffer =
    rawBody instanceof ArrayBuffer
      ? new Uint8Array(rawBody)
      : new Uint8Array(rawBody);

  const signatureBuffer = await crypto.subtle.sign("HMAC", key, bodyBuffer);

  const computed = Buffer.from(signatureBuffer).toString("hex");

  // Constant-time comparison
  if (computed.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < computed.length; i++) {
    mismatch |= computed.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}

// =====================================================
// ERROR HANDLING
// =====================================================

export class CustomerIOError extends Error {
  public readonly statusCode?: number;
  public readonly retryAfter?: number;

  constructor(
    message: string,
    options?: {
      statusCode?: number;
      retryAfter?: number;
    },
  ) {
    super(message);
    this.name = "CustomerIOError";
    this.statusCode = options?.statusCode;
    this.retryAfter = options?.retryAfter;
  }
}

export function isCustomerIOError(error: unknown): error is CustomerIOError {
  return error instanceof CustomerIOError;
}
