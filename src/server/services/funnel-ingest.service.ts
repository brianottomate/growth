import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/server/db";
import { funnelStateTable } from "@/server/db/funnel-schema";

// =====================================================
// Funnel event ingest — Amplitude webhook → funnel_state
//
// One upsert per event, keyed on userId, guarded on the event timestamp
// so retries and out-of-order deliveries can only advance state, never
// regress it. Purely dark: records state, sends nothing. The sweep and
// heal jobs (Phase 1, docs/funnel-abandonment.md) read this table.
// =====================================================

/** Events we ingest, normalized to snake_case. Everything else is ignored. */
const FUNNEL_EVENTS = [
  "search_started",
  "product_added_to_wishlist",
  "checkout_started",
  "payment_info_entered",
  "order_completed",
] as const;
export type FunnelEventName = (typeof FUNNEL_EVENTS)[number];

export interface FunnelEventInput {
  eventName: string;
  /** ISO string or epoch millis from Amplitude's {{event.event_time}}. */
  timestamp: string | number | null;
  userId: string | null;
  email: string | null;
  properties: Record<string, unknown>;
}

export type IngestResult =
  | { status: "applied"; eventName: FunnelEventName }
  | { status: "skipped_stale"; eventName: FunnelEventName }
  | { status: "ignored_event"; eventName: string }
  | { status: "missing_identity" }
  | { status: "invalid_timestamp" };

/** "Search Started" / "Purchased" / "search_started" → canonical snake_case. */
export function normalizeFunnelEventName(raw: string): string {
  const name = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  // The server-side conversion event is "Order Completed"; the mobile client
  // historically also emits "Purchased". Both mean the same stage exit.
  if (name === "purchased") return "order_completed";
  return name;
}

function isFunnelEvent(name: string): name is FunnelEventName {
  return (FUNNEL_EVENTS as readonly string[]).includes(name);
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return undefined;
}

/** YYYY-MM-DD out of a date-ish string (checkin_date arrives ISO or plain). */
function asDateOnly(value: unknown): string | undefined {
  const str = asString(value);
  if (!str) return undefined;
  const candidate = str.includes("T") ? str.split("T")[0]! : str;
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : undefined;
}

function parseEventTs(value: string | number | null): Date | null {
  if (value == null) return null;
  const date =
    typeof value === "number" ? new Date(value) : new Date(value.trim());
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Upsert one funnel event into funnel_state.
 *
 * The per-stage `setWhere` timestamp guard is the idempotency mechanism:
 * an Amplitude retry (same ts) or an out-of-order older event fails the
 * `<` comparison and leaves the row untouched.
 */
export async function ingestFunnelEvent(
  input: FunnelEventInput,
): Promise<IngestResult> {
  const eventName = normalizeFunnelEventName(input.eventName);
  if (!isFunnelEvent(eventName)) {
    return { status: "ignored_event", eventName };
  }

  const userId = asString(input.userId);
  if (!userId) {
    return { status: "missing_identity" };
  }

  const eventTs = parseEventTs(input.timestamp);
  if (!eventTs) {
    return { status: "invalid_timestamp" };
  }

  const email = input.email ? (asString(input.email) ?? null) : null;
  const props = input.properties;

  // Per-event column payloads. Shared identity fields ride along on every
  // event; email only overwrites when the incoming event actually has one.
  const emailUpdate = email ? { email } : {};

  switch (eventName) {
    case "search_started": {
      const values = {
        lastSearchTs: eventTs,
        lastSearchDestination: asString(props.destination) ?? null,
        lastSearchCheckin: asDateOnly(props.checkin_date) ?? null,
        lastSearchCheckout: asDateOnly(props.checkout_date) ?? null,
        lastSearchFlexible: asBoolean(props.search_flexible) ?? null,
        lastSearchTrigger: asString(props.search_trigger) ?? null,
        lastSearchParentId: asString(props.search_parent_id) ?? null,
      };
      await db
        .insert(funnelStateTable)
        .values({ userId, email, ...values, searchCount: 1 })
        .onConflictDoUpdate({
          target: funnelStateTable.userId,
          set: {
            ...values,
            ...emailUpdate,
            searchCount: sql`${funnelStateTable.searchCount} + 1`,
          },
          setWhere: sql`${funnelStateTable.lastSearchTs} IS NULL OR ${funnelStateTable.lastSearchTs} < ${eventTs}`,
        });
      return { status: "applied", eventName };
    }

    case "product_added_to_wishlist": {
      const values = {
        lastWishlistTs: eventTs,
        lastWishlistProperty:
          asString(props.property_name) ?? asString(props.name) ?? null,
      };
      await db
        .insert(funnelStateTable)
        .values({ userId, email, ...values })
        .onConflictDoUpdate({
          target: funnelStateTable.userId,
          set: { ...values, ...emailUpdate },
          setWhere: sql`${funnelStateTable.lastWishlistTs} IS NULL OR ${funnelStateTable.lastWishlistTs} < ${eventTs}`,
        });
      return { status: "applied", eventName };
    }

    case "checkout_started": {
      const values = {
        lastCheckoutTs: eventTs,
        lastCheckoutProperty:
          asString(props.property_name) ?? asString(props.name) ?? null,
        lastCheckoutCheckin: asDateOnly(props.checkin_date) ?? null,
        lastCheckoutCheckout: asDateOnly(props.checkout_date) ?? null,
        lastCheckoutValue: asNumber(props.value) ?? null,
      };
      await db
        .insert(funnelStateTable)
        .values({ userId, email, ...values })
        .onConflictDoUpdate({
          target: funnelStateTable.userId,
          set: { ...values, ...emailUpdate },
          setWhere: sql`${funnelStateTable.lastCheckoutTs} IS NULL OR ${funnelStateTable.lastCheckoutTs} < ${eventTs}`,
        });
      return { status: "applied", eventName };
    }

    case "payment_info_entered": {
      const values = { lastPaymentTs: eventTs };
      await db
        .insert(funnelStateTable)
        .values({ userId, email, ...values })
        .onConflictDoUpdate({
          target: funnelStateTable.userId,
          set: { ...values, ...emailUpdate },
          setWhere: sql`${funnelStateTable.lastPaymentTs} IS NULL OR ${funnelStateTable.lastPaymentTs} < ${eventTs}`,
        });
      return { status: "applied", eventName };
    }

    case "order_completed": {
      const values = { lastPurchaseTs: eventTs };
      await db
        .insert(funnelStateTable)
        .values({ userId, email, ...values })
        .onConflictDoUpdate({
          target: funnelStateTable.userId,
          set: { ...values, ...emailUpdate },
          setWhere: sql`${funnelStateTable.lastPurchaseTs} IS NULL OR ${funnelStateTable.lastPurchaseTs} < ${eventTs}`,
        });
      return { status: "applied", eventName };
    }
  }
}
