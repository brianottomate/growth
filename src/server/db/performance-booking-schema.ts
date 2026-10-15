import { index, pgTable } from "drizzle-orm/pg-core";
import type {
  AttributionResult,
  BookingAttribution,
} from "@/lib/performance-booking";
import { performanceAccountTable } from "./performance-schema";

// One candidate booking for a Performance client, never a mirror of analytics events.
export const performanceBookingTable = pgTable(
  "performance_booking",
  (t) => ({
    bookingId: t.text().primaryKey(),
    accountId: t
      .text()
      .notNull()
      .references(() => performanceAccountTable.id, { onDelete: "restrict" }),
    websiteId: t.text().notNull(),
    propertyId: t.text().notNull(),
    confirmedAt: t.timestamp({ withTimezone: true }).notNull(),
    checkIn: t.date(),
    checkOut: t.date(),
    currency: t.text().notNull(),
    total: t.numeric({ precision: 16, scale: 2, mode: "number" }).notNull(),
    revenue: t.numeric({ precision: 16, scale: 2, mode: "number" }),
    attribution: t.jsonb().$type<BookingAttribution>().notNull(),
    confidence: t.text().$type<AttributionResult["confidence"]>().notNull(),
    evidence: t.jsonb().$type<AttributionResult["evidence"]>().notNull(),
    classifiedAt: t.timestamp({ withTimezone: true }),
    receivedAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
  }),
  (t) => [
    index("performance_booking_account_time_idx").on(
      t.accountId,
      t.confirmedAt,
    ),
  ],
);
