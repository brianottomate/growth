import { index, pgTable, uniqueIndex } from "drizzle-orm/pg-core";
import type { LifecycleCondition } from "@/lib/validators/lifecycle-runtime";
import { brandTable } from "./brand-schema";
import { platformPostTable } from "./content-schema";
import { createId } from "./utils";

export const emailSequenceTable = pgTable(
  "email_sequence",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("esq")),
    brandId: t
      .text()
      .notNull()
      .references(() => brandTable.id, { onDelete: "cascade" }),
    name: t.text().notNull(),
    description: t.text().notNull().default(""),
    triggerEvent: t.text().notNull(),
    exitCondition: t.jsonb().$type<LifecycleCondition>(),
    version: t.integer().notNull().default(1),
    createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
    deletedAt: t.timestamp({ withTimezone: true }),
  }),
  (t) => [index("email_sequence_brand_idx").on(t.brandId)],
);

export const emailSequenceStepTable = pgTable(
  "email_sequence_step",
  (t) => ({
    id: t.text().primaryKey(),
    sequenceId: t
      .text()
      .notNull()
      .references(() => emailSequenceTable.id, { onDelete: "cascade" }),
    platformPostId: t
      .text()
      .references(() => platformPostTable.id, { onDelete: "set null" }),
    name: t.text().notNull(),
    position: t.integer().notNull(),
    waitMinutes: t.integer().notNull().default(0),
  }),
  (t) => [
    uniqueIndex("email_sequence_step_position_idx").on(
      t.sequenceId,
      t.position,
    ),
  ],
);
