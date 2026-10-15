import { index, pgSchema, primaryKey } from "drizzle-orm/pg-core";

import { brandTable } from "./brand-schema";
import { createId } from "./utils";

/**
 * Operator-uploaded email lists (a client's newsletter export, say). Like
 * `leads`, they live in their own Postgres schema so they can move to a
 * separate email service with no untangling: the only reference out is the
 * brand. Members are immutable once uploaded; a new export is a new list.
 */
export const emailSchema = pgSchema("email");

export const emailListTable = emailSchema.table("list", (t) => ({
  id: t
    .text()
    .primaryKey()
    .$defaultFn(() => createId("elist")),
  brandId: t
    .text()
    .notNull()
    .references(() => brandTable.id, { onDelete: "cascade" }),
  name: t.text().notNull(),
  fileName: t.text(),
  memberCount: t.integer().notNull(),
  invalidCount: t.integer().notNull().default(0),
  duplicateCount: t.integer().notNull().default(0),
  /** Bot-generated first names cleared at upload ("GYCETzIUgVASAdh"). */
  namesCleared: t.integer().notNull().default(0),
  createdBy: t.text(),
  createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
}));

export const emailListMemberTable = emailSchema.table(
  "list_member",
  (t) => ({
    listId: t
      .text()
      .notNull()
      .references(() => emailListTable.id, { onDelete: "cascade" }),
    /** Lowercased and trimmed. */
    email: t.text().notNull(),
    firstName: t.text(),
    lastName: t.text(),
    /** The source system's id for this person, e.g. Mailchimp's LEID. */
    sourceId: t.text(),
    /**
     * sha256(email) in hex. Samples and send waves take members in this
     * order, so a sample of 100 always sits inside a sample of 1,000.
     */
    sampleRank: t.text().notNull(),
  }),
  (t) => [
    primaryKey({ columns: [t.listId, t.email] }),
    index("email_list_member_rank_idx").on(t.listId, t.sampleRank, t.email),
  ],
);

/**
 * Who stopped a brand's marketing email, recorded by Growth's own
 * unsubscribe link and one-click header (the brand's Postmark broadcast
 * stream leaves unsubscribes to us). Every Growth send skips these.
 */
export const emailOptOutTable = emailSchema.table(
  "opt_out",
  (t) => ({
    brandId: t
      .text()
      .notNull()
      .references(() => brandTable.id, { onDelete: "cascade" }),
    /** Lowercased and trimmed. */
    email: t.text().notNull(),
    /** "link" (the footer page), "one_click" (List-Unsubscribe-Post), or an import. */
    source: t.text().notNull(),
    createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
  }),
  (t) => [primaryKey({ columns: [t.brandId, t.email] })],
);
