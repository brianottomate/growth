import { check, index, pgTable } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizationTable } from "./auth-schema";
import { amplifierTable } from "./amplification-schema";
import { brandTable } from "./brand-schema";
import { homeTable } from "./home-schema";
import { createId } from "./utils";

// One collaboration, independently of reusable browsing collections.
export const influencerPartnershipTable = pgTable(
  "influencer_partnership",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("ipart")),
    organizationId: t
      .text()
      .notNull()
      .references(() => organizationTable.id, { onDelete: "cascade" }),
    amplifierId: t
      .text()
      .notNull()
      .references(() => amplifierTable.id, { onDelete: "restrict" }),
    brandId: t
      .text()
      .notNull()
      .references(() => brandTable.id, { onDelete: "restrict" }),
    homeId: t.text().references(() => homeTable.id, { onDelete: "restrict" }),
    checkIn: t.date(),
    checkOut: t.date(),
    deliverables: t.text(),
    notes: t.text(),
    createdAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
    deletedAt: t.timestamp({ withTimezone: true }),
  }),
  (t) => [
    index("influencer_partnership_org_idx").on(t.organizationId),
    index("influencer_partnership_amplifier_idx").on(t.amplifierId),
    index("influencer_partnership_brand_idx").on(t.brandId),
    check(
      "influencer_partnership_dates_check",
      sql`(${t.checkIn} is null and ${t.checkOut} is null) or (${t.checkIn} is not null and ${t.checkOut} is not null and ${t.checkOut} > ${t.checkIn})`,
    ),
  ],
);
