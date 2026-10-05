/**
 * Export a brand's catalog with cards that are not approved yet. The Studio's
 * Create export refuses until every included card is signed off; this is the
 * escape hatch for looking at a render or feed before review is done.
 *
 *   NODE_ENV=development bun --conditions=react-server \
 *     scripts/export-catalog-unapproved.ts <brand-slug> [user-email]
 *
 * NODE_ENV must be development: the lock bypass in `catalogLockBypass` checks
 * it. The user defaults to kristian@wander.com and must be a member of the
 * brand's organization. Renders in the foreground and prints the run id.
 */
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { brandTable, userTable } from "@/server/db/schema";
import {
  renderCatalogExport,
  startCatalogExport,
} from "@/server/services/catalog-studio.service";

const [slug, email = "kristian@wander.com"] = process.argv.slice(2);
if (!slug) {
  console.error(
    "usage: export-catalog-unapproved.ts <brand-slug> [user-email]",
  );
  process.exit(1);
}
if (process.env.NODE_ENV !== "development") {
  console.error("Run with NODE_ENV=development; the lock bypass needs it.");
  process.exit(1);
}

const [brand, user] = await Promise.all([
  db.query.brandTable.findFirst({
    where: and(eq(brandTable.slug, slug), isNull(brandTable.deletedAt)),
    columns: { id: true, name: true },
  }),
  db.query.userTable.findFirst({
    where: eq(userTable.email, email),
    columns: { id: true },
  }),
]);
if (!brand) throw new Error(`No brand with slug ${slug}`);
if (!user) throw new Error(`No user ${email}`);

const run = await startCatalogExport(user.id, brand.id, true);
console.log(`${brand.name}: export ${run.run.id} started`);
await renderCatalogExport(run, user.id);
const done = await db.query.workflowRunTable.findFirst({
  where: (t, { eq }) => eq(t.id, run.run.id),
  columns: { status: true, error: true },
});
console.log(`${brand.name}: export ${run.run.id} ${done?.status}`);
if (done?.status !== "succeeded") {
  console.error(done?.error ?? "The export did not finish.");
  process.exit(1);
}
process.exit(0);
