import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

const DEFAULT_PROPERTY_URL =
  "https://www.wander.com/property/wander-north-topsail-beach";
const ROOT = path.resolve(import.meta.dir, "../..");

type SourceImage = {
  id: string;
  assetId: string;
  order: number;
  fullResUrl: string;
  reviewUrl: string;
  downloadedUrl: string;
  localReviewPath: string;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
};

type SourceManifest = {
  schemaVersion: 2;
  acquiredAt: string;
  source: {
    kind: "wander-property-page";
    propertyUrl: string;
    propertyId: string | null;
    propertyName: string | null;
    propertySlug: string;
    extraction: "next-flight-property-gallery-order";
  };
  imageCount: number;
  images: SourceImage[];
};

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function propertySlug(propertyUrl: string) {
  const slug = new URL(propertyUrl).pathname.split("/").filter(Boolean).at(-1);
  if (!slug)
    throw new Error(`Could not determine property slug from ${propertyUrl}`);
  return slug;
}

function extractFirst(html: string, pattern: RegExp) {
  return pattern.exec(html)?.[1]?.replaceAll('\\"', '"') ?? null;
}

function extractGallery(html: string) {
  const byOrder = new Map<number, string>();
  const galleryMarker =
    /\\"galleries\\":\[\{\\"id\\":\\"[^\"]+\\",\\"order\\":0,\\"type\\":\\"PROPERTY\\",\\"items\\":\[/;
  const marker = galleryMarker.exec(html);
  if (!marker) return [];
  const start = marker.index + marker[0].length;
  const end = html.indexOf('],\\"beds\\":', start);
  if (end === -1) return [];
  const propertyGallery = html.slice(start, end);
  const pattern =
    /\\"order\\":(\d+),\\"media\\":\{[\s\S]{0,12000}?\\"fullResUrl\\":\\"https:\/\/assets\.wander\.com\/([0-9]+)\/fullres\.webp/g;

  for (const match of propertyGallery.matchAll(pattern)) {
    const order = Number(match[1]);
    const assetId = match[2];
    if (!assetId || !Number.isInteger(order)) continue;
    const existing = byOrder.get(order);
    if (existing && existing !== assetId) {
      throw new Error(
        `Gallery order ${order} points to both ${existing} and ${assetId}`,
      );
    }
    byOrder.set(order, assetId);
  }

  return [...byOrder.entries()]
    .map(([order, assetId]) => ({ assetId, order }))
    .sort((left, right) => left.order - right.order);
}

async function download(
  urls: string[],
  destination: string,
  cachedUrl?: string,
) {
  try {
    const existing = await stat(destination);
    if (existing.size > 0) {
      return {
        buffer: await readFile(destination),
        url: cachedUrl ?? urls[0]!,
      };
    }
  } catch {
    // Cache miss.
  }

  for (const url of urls) {
    const response = await fetch(url, {
      headers: { "user-agent": "Wander Growth property showcase lab" },
    });
    if (!response.ok) continue;
    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(destination, buffer);
    return { buffer, url };
  }

  throw new Error(`No usable rendition for ${urls.join(", ")}`);
}

const propertyUrl = argument("--property") ?? DEFAULT_PROPERTY_URL;
const slug = propertySlug(propertyUrl);
const outputRoot = path.join(ROOT, "runs/property-showcase", slug);
const reviewDirectory = path.join(outputRoot, "gallery-images");
await mkdir(reviewDirectory, { recursive: true });
const manifestPath = path.join(outputRoot, "source-manifest.json");
const previousManifest = await readFile(manifestPath, "utf8")
  .then((value) => JSON.parse(value) as SourceManifest)
  .catch(() => null);
const previousDownloads = new Map(
  previousManifest?.images.map((image) => [image.assetId, image.downloadedUrl]),
);

const response = await fetch(propertyUrl, {
  headers: { "user-agent": "Wander Growth property showcase lab" },
});
if (!response.ok) {
  throw new Error(
    `Property page failed (${response.status}) for ${propertyUrl}`,
  );
}
const html = await response.text();
const gallery = extractGallery(html);
if (!gallery.length) {
  throw new Error(`No ordered Wander gallery found in ${propertyUrl}`);
}
const orders = gallery.map((image) => image.order);
if (
  new Set(orders).size !== gallery.length ||
  orders.at(-1) !== gallery.length - 1
) {
  throw new Error(
    `Gallery order is not a unique zero-based sequence: ${gallery.length} matches, ${new Set(orders).size} unique orders, max ${orders.at(-1)}`,
  );
}

const images: SourceImage[] = [];
for (const [index, { assetId, order }] of gallery.entries()) {
  const id = `NTP-${String(order + 1).padStart(4, "0")}`;
  const filename = `${id}-${assetId}.webp`;
  const localPath = path.join(reviewDirectory, filename);
  const reviewUrl = `https://assets.wander.com/${assetId}/1200.webp`;
  const fullResUrl = `https://assets.wander.com/${assetId}/fullres.webp`;
  const { buffer, url: downloadedUrl } = await download(
    [reviewUrl, fullResUrl],
    localPath,
    previousDownloads.get(assetId),
  );
  const metadata = await sharp(buffer).metadata();

  images.push({
    id,
    assetId,
    order,
    fullResUrl,
    reviewUrl,
    downloadedUrl,
    localReviewPath: path.relative(ROOT, localPath),
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    bytes: buffer.byteLength,
    sha256: createHash("sha256").update(buffer).digest("hex"),
  });
  process.stdout.write(`\rDownloaded ${index + 1}/${gallery.length}`);
}
process.stdout.write("\n");

const manifest: SourceManifest = {
  schemaVersion: 2,
  acquiredAt: new Date().toISOString(),
  source: {
    kind: "wander-property-page",
    propertyUrl,
    propertyId: extractFirst(html, /\\?"id\\?":\\?"(cm[a-z0-9]+)\\?"/),
    propertyName: extractFirst(
      html,
      /\\?"name\\?":\\?"(Wander North Topsail Beach)\\?"/,
    ),
    propertySlug: slug,
    extraction: "next-flight-property-gallery-order",
  },
  imageCount: images.length,
  images,
};

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Manifest: ${manifestPath}`);
console.log(`Review images: ${reviewDirectory}`);
