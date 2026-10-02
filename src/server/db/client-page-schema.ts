import { sql } from "drizzle-orm";
import { pgTable, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { brandTable } from "./brand-schema";
import { createId } from "./utils";
import type { ClientPageSurface } from "@/lib/client-page-activity";

/** Qualified visible sessions, not identities or raw URL/credential logs. */
export const clientPageViewTable = pgTable(
  "client_page_view",
  (t) => ({
    id: t
      .text()
      .primaryKey()
      .$defaultFn(() => createId("cpv")),
    brandId: t
      .text()
      .notNull()
      .references(() => brandTable.id, { onDelete: "cascade" }),
    surface: t.text().$type<ClientPageSurface>().notNull(),
    visitId: t.uuid().notNull(),
    viewedAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
  }),
  (t) => [
    uniqueIndex("client_page_view_session_idx").on(
      t.brandId,
      t.surface,
      t.visitId,
    ),
    index("client_page_view_brand_idx").on(t.brandId, t.viewedAt),
    check(
      "client_page_view_surface_check",
      sql`${t.surface} in ('pitch','intake','social_connect','email_dns')`,
    ),
  ],
);
