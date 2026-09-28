import { eq } from "drizzle-orm";
import sharp from "sharp";
import { db } from "@/server/db";
import { brandTable } from "@/server/db/schema";
import { catalogState } from "@/server/services/catalog-studio.service";
import { autofillCatalogCard } from "@/server/services/catalog-quick-fix.service";
const U = "U86Un3CoiMpdGhKkcOsVItVbzrwTsAOj";
for (const slug of ["30a-beach-stays", "hollyhock-suites", "chalets-hh"]) {
  const b = await db.query.brandTable.findFirst({
    where: eq(brandTable.slug, slug),
    columns: { id: true },
  });
  if (!b) {
    console.log("no brand", slug);
    continue;
  }
  const st = await catalogState(U, b.id);
  const small: string[] = [];
  for (const c of st.draft.cards.filter((c) => c.included)) {
    try {
      const buf = Buffer.from(await (await fetch(c.imageUrl)).arrayBuffer());
      const m = await sharp(buf).metadata();
      if (Math.min(m.width ?? 0, m.height ?? 0) < 700) {
        small.push(c.homeId);
        console.log(slug, "small", c.homeId, m.width, m.height, c.imageUrl);
      }
    } catch (e) {
      console.log(slug, "fetch failed", c.homeId, String(e));
    }
  }
  console.log(
    slug,
    `${small.length} small of ${st.draft.cards.filter((c) => c.included).length}`,
  );
  for (const homeId of small) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const r = await autofillCatalogCard({
          userId: U,
          brandId: b.id,
          homeId,
        });
        console.log(slug, "fixed", homeId, JSON.stringify(r).slice(0, 300));
        break;
      } catch (e) {
        console.log(slug, "retry", homeId, attempt, String(e).slice(0, 200));
      }
    }
  }
}
console.log("done");
