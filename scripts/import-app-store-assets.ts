// One-off importer: pull the official Apple App Store icon + screenshots for a
// storefront (via the public iTunes lookup API) into the brand Media Library
// (R2 + media_asset rows), then reference them from the storefront content.
//
// Run: bun --conditions=react-server scripts/import-app-store-assets.ts --storefront <store_id>

import { eq } from "drizzle-orm";

import { db } from "../src/server/db";
import {
  mediaAssetTable,
  productTable,
  storefrontTable,
} from "../src/server/db/schema";
import { createId } from "../src/server/db/utils";
import { R2 } from "../src/server/clients/r2.client";
import {
  updateStorefront,
  type ProductStorefrontActor,
} from "../src/server/services/product-storefront.service";

const storefrontId = process.argv[process.argv.indexOf("--storefront") + 1];
if (!storefrontId || storefrontId.startsWith("--")) {
  throw new Error(
    "Usage: bun --conditions=react-server scripts/import-app-store-assets.ts --storefront <store_id>",
  );
}

const storefront = await db.query.storefrontTable.findFirst({
  where: eq(storefrontTable.id, storefrontId),
});
if (!storefront) throw new Error(`Storefront not found: ${storefrontId}`);
if (!storefront.externalListingId) {
  throw new Error("Storefront has no externalListingId (Apple app id)");
}

const product = await db.query.productTable.findFirst({
  where: eq(productTable.id, storefront.productId),
});
if (!product) throw new Error(`Product not found: ${storefront.productId}`);
const brandId = product.brandId;

const lookupRes = await fetch(
  `https://itunes.apple.com/lookup?id=${storefront.externalListingId}&country=us`,
);
if (!lookupRes.ok) throw new Error(`iTunes lookup failed: ${lookupRes.status}`);
const lookup = (await lookupRes.json()) as {
  results: Array<{
    artworkUrl512?: string;
    screenshotUrls?: string[];
  }>;
};
const app = lookup.results[0];
if (!app) throw new Error("App not found in iTunes lookup");

// Apple artwork URLs end in "<w>x<h>bb.<ext>"; that component is a render
// instruction, so we can request higher resolutions than the API defaults.
function resized(url: string, size: string): string {
  return url.replace(/\/[0-9]+x[0-9]+bb\.(png|jpg|jpeg|webp)$/, `/${size}`);
}

function pngDims(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24 || buf.readUInt32BE(12) !== 0x49484452) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function jpegDims(buf: Buffer): { width: number; height: number } | null {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1]!;
    const len = buf.readUInt16BE(i + 2);
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      return {
        width: buf.readUInt16BE(i + 7),
        height: buf.readUInt16BE(i + 5),
      };
    }
    i += 2 + len;
  }
  return null;
}

async function fetchImage(preferred: string, fallback: string) {
  for (const url of [preferred, fallback]) {
    const res = await fetch(url);
    if (!res.ok) continue;
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get("content-type") ?? "image/png";
    const dims = mime.includes("png") ? pngDims(buf) : jpegDims(buf);
    return { buf, mime, dims, url };
  }
  throw new Error(`Failed to fetch image: ${preferred}`);
}

async function ingest(input: {
  preferredUrl: string;
  fallbackUrl: string;
  title: string;
  filename: string;
  alt: string;
}): Promise<string> {
  const { buf, mime, dims } = await fetchImage(
    input.preferredUrl,
    input.fallbackUrl,
  );
  const mediaId = createId("media");
  const key = R2.buildKey(brandId, mediaId, input.filename);
  const url = await R2.putBuffer(key, buf, mime);
  await db.insert(mediaAssetTable).values({
    id: mediaId,
    brandId,
    uploadedBy: null,
    provider: "r2",
    kind: "image",
    status: "ready",
    title: input.title,
    alt: input.alt,
    filename: input.filename,
    mimeType: mime,
    size: buf.length,
    r2Key: key,
    url,
    width: dims?.width ?? null,
    height: dims?.height ?? null,
  });
  console.log(
    `  ${input.title}: ${mediaId} (${dims?.width}x${dims?.height}, ${(buf.length / 1024).toFixed(0)} KB)`,
  );
  return mediaId;
}

console.log(
  `Importing App Store assets for ${storefrontId} (brand ${brandId})`,
);

const iconUrl = app.artworkUrl512;
if (!iconUrl) throw new Error("No artworkUrl512 in lookup result");
const iconId = await ingest({
  preferredUrl: resized(iconUrl, "1024x1024bb.png"),
  fallbackUrl: iconUrl,
  title: "App Store icon",
  filename: "app-store-icon.png",
  alt: "Wander app icon",
});

const screenshotIds: string[] = [];
for (const [index, url] of (app.screenshotUrls ?? []).entries()) {
  const id = await ingest({
    preferredUrl: resized(url, "1242x2208bb.png"),
    fallbackUrl: url,
    title: `App Store screenshot ${index + 1}`,
    filename: `app-store-screenshot-${index + 1}.png`,
    alt: "Wander iOS App Store screenshot",
  });
  screenshotIds.push(id);
}

const actor: ProductStorefrontActor = {
  orgId: product.organizationId,
  userId: null,
  kind: "seed",
};

const existing = storefront.content;
const updated = await updateStorefront(actor, {
  storefrontId: storefront.id,
  staleNote:
    "Imported official App Store icon and screenshots from the public listing (iTunes lookup API).",
  content: {
    ...existing,
    iconMediaAssetId: iconId,
    screenshots: [
      ...existing.screenshots,
      ...screenshotIds.map((mediaAssetId, index) => ({
        id: `shot_appstore_${index + 1}`,
        mediaAssetId,
        order: existing.screenshots.length + index,
        device: "iPhone",
        presentation: "product_ui" as const,
      })),
    ],
  },
});

console.log(
  `Done. Storefront ${updated.id}: icon set, ${screenshotIds.length} screenshots attached.`,
);
process.exit(0);
