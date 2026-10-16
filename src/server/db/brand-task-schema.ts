import { relations } from "drizzle-orm";
import { index, pgTable, uniqueIndex } from "drizzle-orm/pg-core";
import { brandTable } from "./brand-schema";
import { userTable } from "./auth-schema";
import { createId } from "./utils";
import type {
  BrandTaskDecision,
  TaskCategory,
  TaskStatus,
} from "@/lib/brand-task";

export const brandTaskTable = pgTable(
  "brand_task",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("btask")),
    brandId: t
      .text()
      .notNull()
      .references(() => brandTable.id, { onDelete: "cascade" }),
    templateKey: t.text(),
    title: t.text().notNull(),
    notes: t.text(),
    /** The choice this task waits on, confirmed in one click. */
    decision: t.jsonb().$type<BrandTaskDecision>(),
    category: t.text().$type<TaskCategory>().notNull().default("setup"),
    tags: t.text().array().notNull().default([]),
    status: t.text().$type<TaskStatus>().notNull().default("todo"),
    sortOrder: t.integer().notNull(),
    createdByUserId: t
      .text()
      .references(() => userTable.id, { onDelete: "set null" }),
    assigneeUserId: t
      .text()
      .references(() => userTable.id, { onDelete: "set null" }),
    dueDate: t.date(),
    completedAt: t.timestamp({ withTimezone: true }),
    completedByUserId: t
      .text()
      .references(() => userTable.id, { onDelete: "set null" }),
    createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: t
      .timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: t.timestamp({ withTimezone: true }),
  }),
  (t) => [
    index("brand_task_brand_idx").on(t.brandId),
    index("brand_task_assignee_idx").on(t.assigneeUserId),
    // Deleted template tasks retain their identity so a later promotion cannot resurrect them.
    uniqueIndex("brand_task_template_idx").on(t.brandId, t.templateKey),
  ],
);

export const brandTaskRelations = relations(brandTaskTable, ({ one }) => ({
  brand: one(brandTable, {
    fields: [brandTaskTable.brandId],
    references: [brandTable.id],
  }),
  creator: one(userTable, {
    fields: [brandTaskTable.createdByUserId],
    references: [userTable.id],
    relationName: "brand_task_creator",
  }),
  assignee: one(userTable, {
    fields: [brandTaskTable.assigneeUserId],
    references: [userTable.id],
    relationName: "brand_task_assignee",
  }),
  completedBy: one(userTable, {
    fields: [brandTaskTable.completedByUserId],
    references: [userTable.id],
    relationName: "brand_task_completed_by",
  }),
}));

export type BrandTask = typeof brandTaskTable.$inferSelect;
