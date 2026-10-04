import { extractedCardsSchema } from "./schemas";
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { brandTable, homeTable } from "@/server/db/schema";
const picks: Record<string, number> = {
  Lilypad: 17,
  Pioneer: 5,
  Dogwood: 18,
  Cumberland: 10,
  Alpine: 1,
  "Fireside Lodge": 41,
};
const f = join(
  homedir(),
  "Downloads",
  "Copy eval",
  "chalets-hh",
  "extracted.json",
);
const cards = extractedCardsSchema.parse(JSON.parse(await readFile(f, "utf8")));
const b = (await db.query.brandTable.findFirst({
  where: eq(brandTable.slug, "chalets-hh"),
  columns: { id: true },
}))!;
for (const [name, n] of Object.entries(picks)) {
  const [h] = await db
    .select({ g: homeTable.galleryCache })
    .from(homeTable)
    .where(
      and(
        eq(homeTable.brandId, b.id),
        eq(homeTable.name, `${name} - Hocking Hills`),
        isNull(homeTable.deletedAt),
      ),
    );
  const c = cards.find((x) => x.home === `${name} - Hocking Hills`);
  const photo = h?.g?.[n - 1];
  if (!c || !photo) throw new Error(`Missing card or photo ${n} for ${name}`);
  c.photoNumber = n;
  c.photoUrl = photo.url;
  c.photoPickedBy = "eye";
  console.log(name, c.photoUrl);
}
await writeFile(f, JSON.stringify(cards, null, 2));
process.exit(0);
