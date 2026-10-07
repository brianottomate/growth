import { extractedCardsSchema } from "./schemas";
import type { ExtractedCard } from "./schemas";
/**
 * Chalets Hocking Hills: turn Silvina's 21 finished portrait cards into
 * composed square cards carrying her exact text, on her photo, in her font.
 *
 *   bun --conditions=react-server scripts/copy-eval/_apply-chalets.ts [--only=Falls] [--fonts] [--approve] [--export]
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { and, eq, inArray, isNull } from "drizzle-orm";
import sharp from "sharp";

import { db } from "@/server/db";
import {
  brandTable,
  workflowRunTable,
  homeTable,
  userTable,
} from "@/server/db/schema";
import {
  catalogState,
  editCatalogCard,
  renderCatalogExport,
  setCatalogApproval,
  startCatalogExport,
} from "@/server/services/catalog-studio.service";
import {
  fetchPublicImage,
  importImageBuffer,
} from "@/server/services/media.service";

const args = process.argv.slice(2);
const only = args
  .find((a) => a.startsWith("--only="))
  ?.slice(7)
  .split(",");
const OUT = join(homedir(), "Downloads", "Chalets", "Square proof");
await mkdir(OUT, { recursive: true });

const cards = extractedCardsSchema.parse(
  JSON.parse(
    await readFile(
      join(homedir(), "Downloads", "Copy eval", "chalets-hh", "extracted.json"),
      "utf8",
    ),
  ),
);
const brand = (await db.query.brandTable.findFirst({
  where: eq(brandTable.slug, "chalets-hh"),
  columns: { id: true, brandIdentity: true },
}))!;
const user = (await db.query.userTable.findFirst({
  where: eq(userTable.email, "kristian@wander.com"),
  columns: { id: true },
}))!;

// Rollback snapshot, written once before the first write.
const snapshot = join(OUT, "_rollback.json");
if (!existsSync(snapshot)) {
  const rows = await db
    .select()
    .from(homeTable)
    .where(
      and(
        eq(homeTable.brandId, brand.id),
        inArray(
          homeTable.externalId,
          cards.map((c) => c.homeId),
        ),
        isNull(homeTable.deletedAt),
      ),
    );
  await writeFile(
    snapshot,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        brandIdentity: brand.brandIdentity,
        homes: rows.map((r) => ({
          externalId: r.externalId,
          name: r.name,
          catalogTitle: r.catalogTitle,
          catalogSubtitle: r.catalogSubtitle,
          catalogTemplateId: r.catalogTemplateId,
          catalogImagePosition: r.catalogImagePosition,
          catalogImageAssetId: r.catalogImageAssetId,
          catalogMode: r.catalogMode,
          catalogFinishedAssetId: r.catalogFinishedAssetId,
          catalogShowLogo: r.catalogShowLogo,
          catalogApproval: r.catalogApproval,
        })),
      },
      null,
      2,
    ),
  );
  console.log("snapshot →", snapshot);
}

if (args.includes("--fonts")) {
  const identity = brand.brandIdentity ?? {};
  await db
    .update(brandTable)
    .set({
      brandIdentity: {
        ...identity,
        fonts: [
          { family: "Gentium Book Plus", role: "heading", weight: 400 },
          { family: "Inter", role: "body" },
        ],
        fontsChosen: { by: user.id, at: new Date().toISOString() },
      },
    })
    .where(eq(brandTable.id, brand.id));
  console.log("fonts set: Gentium Book Plus 400 / Inter");
}

// Her photo, into the library as a JPEG (satori cannot decode WebP). Fireside's
// listing photo carries a "Seasonal pool" badge in its top band, which her
// portrait crop cut off; the import trims it the same way.
const TRIM_TOP: Record<string, number> = {
  "Fireside Lodge - Hocking Hills": 0.16,
};
async function importPhoto(card: ExtractedCard) {
  if (!card.photoUrl) throw new Error(`${card.home}: no selected photo`);
  const source = (await fetchPublicImage(card.photoUrl)).body;
  let image = sharp(source).rotate();
  const meta = await image.metadata();
  if (!meta.width || !meta.height || Math.min(meta.width, meta.height) < 700)
    throw new Error(
      `${card.home}: photo too small (${meta.width}×${meta.height})`,
    );
  const trim = TRIM_TOP[card.home];
  if (trim) {
    const top = Math.round(meta.height * trim);
    image = image.extract({
      left: 0,
      top,
      width: meta.width,
      height: meta.height - top,
    });
  }
  const body = await image.jpeg({ quality: 90 }).toBuffer();
  const out = await sharp(body).metadata();
  const asset = await importImageBuffer({
    brandId: brand.id,
    uploadedBy: user.id,
    body,
    contentType: "image/jpeg",
    filename: `${card.home
      .replace(/ - Hocking Hills$/, "")
      .replace(/[^\w]+/g, "-")
      .toLowerCase()}-catalog-photo.jpg`,
    title: `${card.home} · square catalog photo`,
    width: out.width,
    height: out.height,
    externalUrl: card.photoUrl,
    sourceProvider: "other",
    metadata: {
      source: "listing",
      listingPhotoUrl: card.photoUrl,
      trimmedTop: trim ?? null,
    },
  });
  return (asset as { id: string }).id;
}

const skip = args
  .find((a) => a.startsWith("--skip="))
  ?.slice(7)
  .split(",");
const todo = cards.filter(
  (c) =>
    (!only || only.some((o) => c.home.startsWith(o))) &&
    !skip?.some((o) => c.home.startsWith(o)),
);
for (const card of args.includes("--no-edit") ? [] : todo) {
  const imageAssetId = await importPhoto(card);
  await setCatalogApproval({
    userId: user.id,
    brandId: brand.id,
    approved: false,
    cards: [{ homeId: card.homeId }],
  });
  await editCatalogCard({
    userId: user.id,
    brandId: brand.id,
    homeId: card.homeId,
    patch: {
      mode: "compose",
      templateId: "catalog-place-plain",
      title: card.headline,
      subtitle: card.facts,
      imageAssetId,
      imagePosition: card.imagePosition ?? "center",
      showLogo: false,
    },
  });
  console.log("✓", card.home, imageAssetId);
}

if (args.includes("--approve")) {
  const state = await catalogState(user.id, brand.id);
  const mine = state.draft.cards.filter((c) =>
    todo.some((t) => t.homeId === c.homeId),
  );
  await setCatalogApproval({
    userId: user.id,
    brandId: brand.id,
    approved: true,
    cards: mine.map((c) => ({
      homeId: c.homeId,
    })),
  });
  console.log("approved", mine.length);
}

if (args.includes("--export")) {
  const run = await startCatalogExport(user.id, brand.id);
  console.log("export", run.run.id, "started");
  await renderCatalogExport({ ...run, fresh: true }, user.id);
  const done = await db.query.workflowRunTable.findFirst({
    where: eq(workflowRunTable.id, run.run.id),
    columns: { status: true, error: true },
  });
  console.log("export", run.run.id, done?.status, done?.error ?? "");
}
process.exit(0);
