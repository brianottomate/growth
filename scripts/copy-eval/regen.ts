import { extractedCardsSchema } from "./schemas";
import type { ExtractedCard } from "./schemas";
/**
 * Write our catalog copy for every card extract.ts read, on the same photo
 * and place the human card uses, without saving anything.
 *
 *   bun --conditions=react-server scripts/copy-eval/regen.ts <brand-slug> [label] [--thorough]
 *
 * Reads and writes ~/Downloads/Copy eval/<slug>/: extracted.json → regen-<label>.json.
 * The label names the prompt version under test (default "baseline").
 */
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { brandTable, userTable } from "@/server/db/schema";
import { newCatalogCopy } from "@/server/services/catalog-quick-fix.service";

const args = process.argv.slice(2);
const slug = args[0];
const label = args[1] && !args[1].startsWith("--") ? args[1] : "baseline";
const thorough = args.includes("--thorough");
if (!slug) throw new Error("usage: regen.ts <brand-slug> [label] [--thorough]");
const DIR = join(homedir(), "Downloads", "Copy eval", slug);

const cards = extractedCardsSchema.parse(
  JSON.parse(await readFile(join(DIR, "extracted.json"), "utf8")),
);
const [brand, user] = await Promise.all([
  db.query.brandTable.findFirst({
    where: eq(brandTable.slug, slug),
    columns: { id: true },
  }),
  db.query.userTable.findFirst({
    where: eq(userTable.email, "kristian@wander.com"),
    columns: { id: true },
  }),
]);
if (!brand || !user) throw new Error("brand or user not found");

async function regen(card: ExtractedCard) {
  const started = Date.now();
  const out = await newCatalogCopy({
    userId: user!.id,
    brandId: brand!.id,
    homeId: card.homeId,
    save: false,
    templateId: "catalog-place",
    place: card.place ?? null,
    thorough,
    ...(card.photoUrl
      ? { photoUrl: card.photoUrl }
      : card.photoShows
        ? { heroNote: card.photoShows }
        : {}),
  });
  return {
    homeId: card.homeId,
    home: card.home,
    human: card.headline,
    ours: out.headline,
    reason: out.reason,
    samePhoto: !!card.photoUrl,
    ms: Date.now() - started,
  };
}

const results = [];
for (let i = 0; i < cards.length; i += i === 0 ? 1 : 10) {
  const wave = cards.slice(i, i === 0 ? 1 : i + 10);
  const done = await Promise.allSettled(wave.map(regen));
  for (const [j, r] of done.entries()) {
    if (r.status === "fulfilled") results.push(r.value);
    else console.error(`✗ ${wave[j]!.home}: ${r.reason}`);
  }
  console.log(`${results.length}/${cards.length}`);
}
const file = join(DIR, `regen-${label}.json`);
await writeFile(file, JSON.stringify(results, null, 2));
for (const r of results)
  console.log(
    `${r.home.slice(0, 24).padEnd(24)} | ${r.human.padEnd(50)} | ${r.ours}`,
  );
console.log(`→ ${file}`);
process.exit(0);
