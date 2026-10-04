import { writeFile } from "node:fs/promises";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { brandTable, homeTable } from "@/server/db/schema";
import { writeAdSetCopy } from "@/server/services/ad-set-copy.service";
const [out] = process.argv.slice(2);
const sets: Record<string, string[]> = {
  "winter-park-escapes": ["Roam River Mansion", "Lakota Antler Villa 200"],
  "legacy-rnr": [],
  "hollyhock-suites": [
    "City Loft Escape with River Views! By Hollyhock",
    "The Churchill Suite  8 Beds/4 baths",
  ],
  "chalets-hh": ["Falls - Hocking Hills", "Fireside Lodge - Hocking Hills"],
};
const result: Record<string, unknown> = {};
for (const [slug, names] of Object.entries(sets)) {
  const brand = (await db.query.brandTable.findFirst({
    where: eq(brandTable.slug, slug),
    columns: { id: true, name: true, story: true },
  }))!;
  const rows = await db
    .select()
    .from(homeTable)
    .where(
      and(
        eq(homeTable.brandId, brand.id),
        isNull(homeTable.deletedAt),
        ...(names.length ? [inArray(homeTable.name, names)] : []),
      ),
    );
  const pick = (names.length ? rows : rows.slice(0, 2)).slice(0, 2);
  const homes = pick.map((r) => ({
    name: r.name,
    place: [r.city, r.state].filter(Boolean).join(", "),
    bedrooms: r.bedrooms ?? null,
    bathrooms: r.bathrooms ?? null,
    guests: r.guests ?? null,
    nightlyFrom: null,
    amenities: r.amenities ?? [],
    description: r.description ?? null,
    heroUrl: r.heroSourceUrl ?? null,
  }));
  result[slug] = await writeAdSetCopy({
    brandName: brand.name,
    brandStory: brand.story,
    homes,
  });
  console.log("ok", slug, homes.map((h) => h.name).join(" | "));
}
await writeFile(out!, JSON.stringify(result, null, 2));
process.exit(0);
