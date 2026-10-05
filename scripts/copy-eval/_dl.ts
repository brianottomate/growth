import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { db } from "@/server/db";
import { catalogExportTable } from "@/server/db/schema";
const id = process.argv[2]!;
const run = (await db.query.catalogExportTable.findFirst({
  where: eq(catalogExportTable.id, id),
}))!;
const out = (run.output ?? {}) as {
  assets?: {
    url?: string;
    homeId?: string;
    name?: string;
    title?: string;
    width?: number;
    height?: number;
  }[];
  feedUrl?: string;
};
const dir = join(homedir(), "Downloads", "Chalets", "Square catalog export");
await mkdir(dir, { recursive: true });
console.log(
  Object.keys(out),
  out.assets?.length,
  JSON.stringify(out.assets?.[0]),
);
const bufs = [];
for (const [i, a] of (out.assets ?? []).entries()) {
  const b = Buffer.from(await (await fetch(a.url!)).arrayBuffer());
  await writeFile(
    join(
      dir,
      `${String(i + 1).padStart(2, "0")}-${(a.title ?? a.name ?? a.homeId ?? "card").replace(/[^\w]+/g, "-")}.png`,
    ),
    b,
  );
  bufs.push(await sharp(b).resize(360, 360).toBuffer());
}
const cols = 5,
  rows = Math.ceil(bufs.length / cols);
await sharp({
  create: {
    width: cols * 364,
    height: rows * 364,
    channels: 3,
    background: "#222",
  },
})
  .composite(
    bufs.map((input, i) => ({
      input,
      left: (i % cols) * 364,
      top: Math.floor(i / cols) * 364,
    })),
  )
  .jpeg({ quality: 80 })
  .toFile(join(dir, "_overview.jpg"));
process.exit(0);
