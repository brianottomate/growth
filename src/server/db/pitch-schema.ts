import { pgTable, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { brandTable } from "./brand-schema";
import { userTable } from "./auth-schema";
import type { PitchOverrides } from "@/lib/pitch-settings";

/** One sales presentation per brand; identity and billing remain on their own records. */
export const brandPitchTable = pgTable(
  "brand_pitch",
  (t) => ({
    brandId: t
      .text()
      .primaryKey()
      .references(() => brandTable.id, { onDelete: "cascade" }),
    overrides: t.jsonb().$type<PitchOverrides>().notNull().default({}),
    revision: t.integer().notNull().default(1),
    updatedAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedBy: t
      .text()
      .references(() => userTable.id, { onDelete: "set null" }),
  }),
  (t) => [check("brand_pitch_revision_positive", sql`${t.revision} > 0`)],
);
