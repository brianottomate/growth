/**
 * Read a brand's finished catalog cards (human-made artwork) back into text,
 * so they can be compared with what our copy prompt writes for the same home.
 *
 *   bun --conditions=react-server scripts/copy-eval/extract.ts <brand-slug> [--list]
 *
 * Sources: chalets-hh = ~/Downloads/Chalets/Catalog Ads/*.png;
 * winter-park-escapes = library assets named *-template-v2.png.
 * Writes ~/Downloads/Copy eval/<slug>/extracted.json. --list only prints the
 * file → home matches.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { and, eq, isNull, like } from "drizzle-orm";
import sharp from "sharp";
import { z } from "zod";

import { db } from "@/server/db";
import { brandTable, homeTable, mediaAssetTable } from "@/server/db/schema";
import { fetchPublicImage } from "@/server/services/media.service";
import { numberedSheet } from "@/server/services/starter-ad-generation.service";

const [slug, flag] = process.argv.slice(2);
if (!slug) throw new Error("usage: extract.ts <brand-slug> [--list]");
const OUT = join(homedir(), "Downloads", "Copy eval", slug);

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/ - hocking hills$/, "")
    .replace(/_s\b/g, "s")
    .replace(/[^a-z0-9]/g, "");

type Card = { file: string; key: string; load: () => Promise<Buffer> };

async function cards(brandSlug: string): Promise<Card[]> {
  if (brandSlug === "chalets-hh") {
    const dir = join(homedir(), "Downloads", "Chalets", "Catalog Ads");
    return (await readdir(dir))
      .filter((f) => f.endsWith(".png"))
      .map((file) => ({
        file,
        key: file
          .replace(/^ChaletsHockingHills_/, "")
          .replace(/_Static.*$/, ""),
        load: () => readFile(join(dir, file)),
      }));
  }
  const rows = await db
    .select({ file: mediaAssetTable.filename, url: mediaAssetTable.url })
    .from(mediaAssetTable)
    .innerJoin(brandTable, eq(brandTable.id, mediaAssetTable.brandId))
    .where(
      and(
        eq(brandTable.slug, brandSlug),
        isNull(mediaAssetTable.deletedAt),
        like(mediaAssetTable.filename, "%-template-v2.png"),
      ),
    );
  return rows.map((r) => ({
    file: r.file!,
    key: r.file!.replace(/^\d+-/, "").replace(/-template-v2\.png$/, ""),
    load: async () => (await fetchPublicImage(r.url!)).body,
  }));
}

const brand = await db.query.brandTable.findFirst({
  where: eq(brandTable.slug, slug),
  columns: { id: true },
});
if (!brand) throw new Error(`No brand ${slug}`);
const homes = await db
  .select({
    id: homeTable.externalId,
    name: homeTable.name,
    gallery: homeTable.galleryCache,
  })
  .from(homeTable)
  .where(and(eq(homeTable.brandId, brand.id), isNull(homeTable.deletedAt)));

const matched = (await cards(slug)).map((card) => {
  const key = norm(card.key);
  const home =
    homes.find((h) => norm(h.name) === key) ??
    homes.find((h) => norm(h.name).startsWith(key)) ??
    homes.find((h) => key.startsWith(norm(h.name)));
  return { card, home };
});
for (const { card, home } of matched)
  console.log(`${card.key.padEnd(40)} → ${home ? home.name : "NO MATCH"}`);
if (flag === "--list") process.exit(0);

const schema = z.object({
  headline: z
    .string()
    .describe("The big headline exactly as printed, line breaks as spaces."),
  lead: z
    .string()
    .describe("The headline without its place suffix (' in …' / ' near …')."),
  place: z
    .string()
    .nullable()
    .describe("The place suffix, e.g. 'Hocking Hills, Ohio', or null."),
  facts: z
    .string()
    .nullable()
    .describe("The small facts line, e.g. '2 bedroom · 1 bath · 4 guests'."),
  rating: z.string().nullable().describe("A rating badge's text, or null."),
  pills: z.array(z.string()).describe("Any pill or tag labels, else empty."),
  otherText: z
    .array(z.string())
    .describe("Any other printed text (logo, price, CTA)."),
  photoNumber: z
    .number()
    .int()
    .nullable()
    .describe(
      "The number on the contact sheet of the exact same photograph the card uses (same angle, season, framing; the card may crop it). Null unless you are sure: a different shot of the same house is not a match.",
    ),
  photoShows: z
    .string()
    .describe("What the card's photo shows, in a short phrase."),
});

async function extract(card: Card, home: (typeof homes)[number]) {
  const image = await sharp(await card.load())
    .resize({ width: 900 })
    .jpeg({ quality: 85 })
    .toBuffer();
  const gallery = (home.gallery ?? []).slice(
    0,
    Number(process.env.MAX_PHOTOS ?? 32),
  );
  const sheets = [];
  for (let offset = 0; offset < gallery.length; offset += 16) {
    const bodies = await Promise.all(
      gallery
        .slice(offset, offset + 16)
        .map(async (p) => (await fetchPublicImage(p.thumbUrl || p.url)).body),
    );
    sheets.push(await numberedSheet(bodies, { firstLabel: offset + 1 }));
  }
  const { output } = await generateText({
    model: anthropic("claude-sonnet-5"),
    providerOptions: { anthropic: { effort: "low" } },
    output: Output.object({ schema }),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `A finished catalog ad for "${home.name}". Transcribe its text exactly.`,
          },
          { type: "file", data: image, mediaType: "image/jpeg" },
          ...sheets.flatMap((sheet, i) => [
            {
              type: "text" as const,
              text: `Listing photos ${i * 16 + 1}–${Math.min((i + 1) * 16, gallery.length)}:`,
            },
            {
              type: "file" as const,
              data: sheet,
              mediaType: "image/jpeg" as const,
            },
          ]),
        ],
      },
    ],
  });
  const photo = output.photoNumber
    ? gallery[output.photoNumber - 1]
    : undefined;
  return {
    file: card.file,
    homeId: home.id,
    home: home.name,
    ...output,
    photoUrl: photo?.url ?? null,
  };
}

await mkdir(OUT, { recursive: true });
const todo = matched.filter(
  (m) =>
    m.home &&
    (!process.env.ONLY ||
      process.env.ONLY.split(",").some((o) => m.card.key.startsWith(o))),
);
const results = [];
// Canary one, then waves of ten.
for (let i = 0; i < todo.length; i += i === 0 ? 1 : 10) {
  const wave = todo.slice(i, i === 0 ? 1 : i + 10);
  const done = await Promise.allSettled(
    wave.map((m) => extract(m.card, m.home!)),
  );
  for (const [j, r] of done.entries()) {
    if (r.status === "fulfilled") results.push(r.value);
    else console.error(`✗ ${wave[j]!.card.file}: ${r.reason}`);
  }
  console.log(`${results.length}/${todo.length}`);
}
await writeFile(
  join(OUT, process.env.ONLY ? "extracted-rematch.json" : "extracted.json"),
  JSON.stringify(results, null, 2),
);
console.log(`→ ${join(OUT, "extracted.json")}`);
process.exit(0);
