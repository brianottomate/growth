import { pgTable, pgSchema, index, jsonb } from "drizzle-orm/pg-core";
import { brandTable } from "./brand-schema";
import { createId } from "./utils";
import type { EmailAudienceDefinition } from "@/lib/email-audience";

// Local integration tests can isolate new audience tables in a private schema.
// Deployments always use public; the override is deliberately development-only.
// Raw process.env, not the validated env: drizzle-kit loads this file in CI
// (db:check) where the app's secrets do not exist.
const devSchema =
  process.env.NODE_ENV === "development"
    ? process.env.EMAIL_AUDIENCE_DEV_SCHEMA
    : undefined;
const audienceTable = (
  devSchema ? pgSchema(devSchema).table : pgTable
) as typeof pgTable;

export const emailAudienceTable = audienceTable(
  "email_audience",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("eaud")),
    brandId: t
      .text()
      .notNull()
      .references(() => brandTable.id, { onDelete: "cascade" }),
    name: t.text().notNull(),
    definition: jsonb().$type<EmailAudienceDefinition>().notNull(),
    revision: t.integer().notNull().default(1),
    createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
  }),
  (t) => [index("email_audience_brand_idx").on(t.brandId)],
);

/** References and audit metadata only; recipients stay in BigQuery or, for an
 * uploaded list, in email.list_member. */
export const emailAudienceSnapshotTable = audienceTable(
  "email_audience_snapshot",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("easnap")),
    audienceId: t
      .text()
      .notNull()
      .references(() => emailAudienceTable.id, { onDelete: "cascade" }),
    revision: t.integer().notNull(),
    definition: jsonb().$type<EmailAudienceDefinition>().notNull(),
    querySql: t.text().notNull(),
    queryHash: t.text().notNull(),
    /** The warehouse compile job and table. An uploaded list has neither:
     * its members never change, so the definition alone fixes who is in it. */
    jobId: t.text(),
    tableId: t.text(),
    status: t
      .text()
      .$type<"compiling" | "ready" | "failed">()
      .notNull()
      .default("compiling"),
    recipientCount: t.integer(),
    error: t.text(),
    expiresAt: t.timestamp({ withTimezone: true }).notNull(),
    createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
  }),
  (t) => [
    index("email_audience_snapshot_audience_idx").on(t.audienceId, t.createdAt),
  ],
);
