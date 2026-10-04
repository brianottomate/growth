import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import sharp from "sharp";
import { db } from "@/server/db";
import { brandTable, homeTable } from "@/server/db/schema";
import { fetchPublicImage } from "@/server/services/media.service";
const name = process.argv[2]!;
const b = (await db.query.brandTable.findFirst({
  where: eq(brandTable.slug, "chalets-hh"),
  columns: { id: true },
}))!;
const [h] = await db
  .select({ g: homeTable.galleryCache, img: homeTable.heroSourceUrl })
  .from(homeTable)
  .where(
    and(
      eq(homeTable.brandId, b.id),
      eq(homeTable.name, `${name} - Hocking Hills`),
      isNull(homeTable.deletedAt),
    ),
  );
const g = h!.g ?? [];
const dir = join(homedir(), "Downloads", "Chalets", "Catalog Ads");
const her = (await readdir(dir)).find((f) =>
  f.includes(`_${name.replace("'", "_")}_`),
)!;
const tiles = [
  {
    input: await sharp(join(dir, her)).resize(240, 300).toBuffer(),
    left: 0,
    top: 0,
  },
];
const cols = 8,
  tw = 180,
  th = 135;
for (const [i, p] of g.entries()) {
  const buf = (await fetchPublicImage(p.thumbUrl || p.url)).body;
  const t = await sharp(buf)
    .resize(tw, th, { fit: "cover" })
    .composite([
      {
        input: Buffer.from(
          `<svg width="40" height="24"><rect width="40" height="24" fill="black"/><text x="4" y="18" font-size="16" fill="white">${i + 1}</text></svg>`,
        ),
        left: 0,
        top: 0,
      },
    ])
    .toBuffer();
  tiles.push({
    input: t,
    left: 250 + (i % cols) * (tw + 4),
    top: Math.floor(i / cols) * (th + 4),
  });
}
const rows = Math.ceil(g.length / cols);
await sharp({
  create: {
    width: 250 + cols * (tw + 4),
    height: Math.max(300, rows * (th + 4)),
    channels: 3,
    background: "#222",
  },
})
  .composite(tiles)
  .jpeg({ quality: 75 })
  .toFile(
    join(
      homedir(),
      "Downloads",
      "Chalets",
      "Square proof",
      `_cand-${name}.jpg`,
    ),
  );
console.log(name, g.length, "photos; hero", h!.img);
process.exit(0);
