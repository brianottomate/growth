import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { brandTable, userTable } from "@/server/db/schema";
import { catalogState } from "@/server/services/catalog-studio.service";
const b = (await db.query.brandTable.findFirst({
  where: eq(brandTable.slug, "chalets-hh"),
  columns: { id: true },
}))!;
const u = (await db.query.userTable.findFirst({
  where: eq(userTable.email, "kristian@wander.com"),
  columns: { id: true },
}))!;
const s = await catalogState(u.id, b.id);
const inc = s.draft.cards.filter((c) => c.included);
console.log(
  "included",
  inc.length,
  "formats",
  s.draft.formats,
  "default tpl",
  s.defaultTemplate,
);
for (const c of inc)
  console.log(
    [
      c.mode ?? "compose",
      c.templateId,
      c.title,
      "|",
      c.subtitle,
      c.imagePosition,
      c.approved ? "APPROVED" : "open",
    ].join(" "),
  );
process.exit(0);
