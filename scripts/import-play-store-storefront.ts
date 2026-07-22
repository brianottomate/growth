// One-off importer: create the Google Play storefront for the Wander product
// and pull the official listing icon + screenshots (scraped from the public
// play.google.com page) into the brand Media Library, referenced from content.
//
// Run: bun --conditions=react-server scripts/import-play-store-storefront.ts --product <prod_id>

import { and, eq } from "drizzle-orm";

import {
  storefrontContentSchema,
  type StorefrontContent,
} from "../src/lib/product-atlas";
import { db } from "../src/server/db";
import {
  mediaAssetTable,
  productTable,
  storefrontTable,
} from "../src/server/db/schema";
import { createId } from "../src/server/db/utils";
import { R2 } from "../src/server/clients/r2.client";
import {
  createStorefront,
  updateStorefront,
  type ProductStorefrontActor,
} from "../src/server/services/product-storefront.service";

const PACKAGE_NAME = "com.wander.com.app";
const LISTING_URL = `https://play.google.com/store/apps/details?id=${PACKAGE_NAME}&hl=en`;

const productId = process.argv[process.argv.indexOf("--product") + 1];
if (!productId || productId.startsWith("--")) {
  throw new Error(
    "Usage: bun --conditions=react-server scripts/import-play-store-storefront.ts --product <prod_id>",
  );
}

const product = await db.query.productTable.findFirst({
  where: eq(productTable.id, productId),
});
if (!product) throw new Error(`Product not found: ${productId}`);
const brandId = product.brandId;

const actor: ProductStorefrontActor = {
  orgId: product.organizationId,
  userId: null,
  kind: "seed",
};

// ---- scrape the public listing --------------------------------------------

const pageRes = await fetch(LISTING_URL, {
  headers: {
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  },
});
if (!pageRes.ok)
  throw new Error(`Play listing fetch failed: ${pageRes.status}`);
const page = await pageRes.text();

// The app's own screenshots render as <img alt="Screenshot image">; every other
// play-lh URL on the page (similar apps, avatars) uses different alt text.
const screenshotUrls = [
  ...page.matchAll(
    /<img[^>]*src="(https:\/\/play-lh\.googleusercontent\.com\/[^"=]+)=[^"]*"[^>]*alt="Screenshot image"/g,
  ),
].map((m) => m[1]!);
const iconMatch =
  /property="og:image"\s+content="(https:\/\/play-lh\.googleusercontent\.com\/[^"=]+)/.exec(
    page,
  );
if (!iconMatch || screenshotUrls.length === 0) {
  throw new Error(
    `Scrape failed: icon=${Boolean(iconMatch)} screenshots=${screenshotUrls.length}`,
  );
}

// ---- media ingestion (same pattern as import-app-store-assets.ts) ---------

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

async function ingest(input: {
  // googleusercontent URLs take a size suffix; oversized requests return the
  // largest available render.
  baseUrl: string;
  size: string;
  title: string;
  filename: string;
  alt: string;
}): Promise<string> {
  const res = await fetch(`${input.baseUrl}=${input.size}`);
  if (!res.ok)
    throw new Error(`Image fetch failed ${res.status}: ${input.baseUrl}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const mime = res.headers.get("content-type") ?? "image/png";
  const dims = mime.includes("png") ? pngDims(buf) : jpegDims(buf);
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
    `  ${input.title}: ${mediaId} (${dims?.width ?? "?"}x${dims?.height ?? "?"}, ${(buf.length / 1024).toFixed(0)} KB, ${mime})`,
  );
  return mediaId;
}

// ---- create the storefront -------------------------------------------------

const existing = await db.query.storefrontTable.findFirst({
  where: and(
    eq(storefrontTable.productId, productId),
    eq(storefrontTable.surface, "google_play_store"),
  ),
});
if (existing) {
  throw new Error(
    `A google_play_store storefront already exists for this product: ${existing.id}`,
  );
}

const playContent: StorefrontContent = storefrontContentSchema.parse({
  positioning: {
    audience:
      "Guests discovering, booking, and managing exceptional vacation homes on Android.",
    valueProposition:
      "Find and book a high-quality vacation home, then keep trip details and Wander concierge in one app.",
    category: "Travel",
    keyMessages: [
      "Vacation homes, but better",
      "Curated homes with hotel-grade amenities",
      "Direct booking and trip management",
      "24/7 concierge service",
    ],
  },
  copy: {
    displayName: "Wander | Find your happy place",
    shortDescription: "Vacation homes, but better",
    longDescription:
      "Find your happy place. Book the perfect Wander smart vacation home with inspiring views, modern workstations, restful beds, hotel-grade cleaning, and 24/7 concierge service. Starting at $495/night, it's a vacation home, but better.",
    tagline: "Find your happy place",
    keywords: [
      "vacation rentals",
      "vacation homes",
      "luxury travel",
      "getaways",
      "concierge",
    ],
    supportText:
      "Website: https://www.wander.com\nSupport: https://www.wander.com/contact\nPrivacy: https://www.wander.com/privacy",
    releaseNotes: "",
  },
  iconMediaAssetId: null,
  screenshots: [],
  promotionalAssets: [],
  videos: [],
  platformFields: {
    packageName: PACKAGE_NAME,
    developer: "Wander.com Inc",
    publicCheckedAt: new Date().toISOString().slice(0, 10),
  },
});

const created = await createStorefront(actor, {
  productId,
  surface: "google_play_store",
  externalListingId: PACKAGE_NAME,
  publicUrl: LISTING_URL,
  managementUrl: null,
  listingStatus: "live",
  content: playContent,
});
console.log(`Created storefront ${created.id} (google_play_store)`);

// ---- ingest assets and attach ----------------------------------------------

const iconId = await ingest({
  baseUrl: iconMatch[1]!,
  size: "w1024-h1024",
  title: "Play Store icon",
  filename: "play-store-icon.png",
  alt: "Wander app icon",
});

const screenshotIds: string[] = [];
for (const [index, url] of screenshotUrls.entries()) {
  const id = await ingest({
    baseUrl: url,
    size: "w2560",
    title: `Play Store screenshot ${index + 1}`,
    filename: `play-store-screenshot-${index + 1}.png`,
    alt: "Wander Android Play Store screenshot",
  });
  screenshotIds.push(id);
}

const updated = await updateStorefront(actor, {
  storefrontId: created.id,
  staleNote:
    "Imported official Play Store icon and screenshots from the public listing page.",
  content: {
    ...playContent,
    iconMediaAssetId: iconId,
    screenshots: screenshotIds.map((mediaAssetId, index) => ({
      id: `shot_playstore_${index + 1}`,
      mediaAssetId,
      order: index,
      device: "Android phone",
      presentation: "product_ui" as const,
    })),
  },
});

console.log(
  `Done. Storefront ${updated.id}: icon set, ${screenshotIds.length} screenshots attached.`,
);
console.log(`Open: /app/apps/${updated.id}`);
process.exit(0);
