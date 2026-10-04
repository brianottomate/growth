import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
const H = join(homedir(), "Downloads", "Chalets");
const proofs = (await readdir(join(H, "Square proof")))
  .filter((f) => f.endsWith(".png"))
  .sort();
const originals = await readdir(join(H, "Catalog Ads"));
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const tiles = [];
for (const p of proofs) {
  const o = originals.find(
    (f) =>
      key(f.replace(/^ChaletsHockingHills_/, "").replace(/_Static.*$/, "")) ===
      key(p.replace(".png", "")),
  );
  const a = await sharp(join(H, "Catalog Ads", o!))
    .resize(320, 400)
    .toBuffer();
  const b = await sharp(join(H, "Square proof", p))
    .resize(400, 400)
    .toBuffer();
  tiles.push(
    await sharp({
      create: { width: 740, height: 410, channels: 3, background: "#222" },
    })
      .composite([
        { input: a, left: 5, top: 5 },
        { input: b, left: 335, top: 5 },
      ])
      .png()
      .toBuffer(),
  );
}
const per = 4;
for (let i = 0; i < tiles.length; i += per) {
  const group = tiles.slice(i, i + per);
  await sharp({
    create: {
      width: 740,
      height: 410 * group.length,
      channels: 3,
      background: "#222",
    },
  })
    .composite(group.map((t, j) => ({ input: t, left: 0, top: j * 410 })))
    .jpeg({ quality: 80 })
    .toFile(join(H, "Square proof", `_sheet-${i / per + 1}.jpg`));
}
console.log(proofs.length);
