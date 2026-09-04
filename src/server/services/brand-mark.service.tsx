import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { ImageResponse } from "next/og";
import sharp from "sharp";

import { db } from "@/server/db";
import { brandTable, mediaAssetTable, type BrandMark } from "@/server/db/schema";
import { brandFontFamily, loadGoogleFont } from "@/server/services/composition-fonts";
import {
  dominantColor,
  tintSilhouette,
  traceSilhouette,
  unwrapImageProxy,
} from "@/server/services/composition-source";
import { importImageBuffer } from "@/server/services/media.service";

export type MarkTone = "color" | "white" | "dark";

export type BrandMarkRecipe = {
  source: BrandMark["source"];
  iconAssetId?: string | null;
  iconFrom?: "logo" | "favicon" | null;
  text?: string | null;
  fontFamily?: string | null;
};

type MarkBrand = {
  id: string;
  name: string;
  logo: string | null;
  organizationId: string | null;
  brandIdentity: {
    colors?: { primary?: string; accent?: string };
    favicon?: string | null;
    fonts?: Array<{ family: string; role?: "body" | "heading" }>;
  } | null;
  websiteMeta: { favicon?: string } | null;
};

async function loadMarkBrand(brandId: string): Promise<MarkBrand> {
  const brand = await db.query.brandTable.findFirst({
    where: and(eq(brandTable.id, brandId), isNull(brandTable.deletedAt)),
    columns: {
      id: true,
      name: true,
      logo: true,
      organizationId: true,
      brandIdentity: true,
      websiteMeta: true,
    },
  });
  if (!brand) throw new Error("Brand not found");
  return brand;
}

/** The text colour a lockup uses in each tone. Colour means the brand's own. */
export function markTextColor(
  tone: MarkTone,
  identity: MarkBrand["brandIdentity"],
): string {
  if (tone === "white") return "#ffffff";
  if (tone === "dark") return "#111111";
  return identity?.colors?.primary ?? identity?.colors?.accent ?? "#111111";
}

/** Where the icon comes from for a recipe, or null for a text-only lockup. */
export async function resolveMarkIconUrl(
  recipe: BrandMarkRecipe,
  brand: MarkBrand,
): Promise<string | null> {
  const favicon = brand.brandIdentity?.favicon ?? brand.websiteMeta?.favicon ?? null;
  if (recipe.source === "favicon") return favicon;
  if (recipe.source === "logo") return brand.logo;
  if (recipe.iconFrom === "logo") return brand.logo;
  if (recipe.iconFrom === "favicon") return favicon;
  if (!recipe.iconAssetId) return null;
  const asset = await db.query.mediaAssetTable.findFirst({
    where: and(
      eq(mediaAssetTable.id, recipe.iconAssetId),
      eq(mediaAssetTable.brandId, brand.id),
      eq(mediaAssetTable.status, "ready"),
      isNull(mediaAssetTable.deletedAt),
    ),
    columns: { url: true },
  });
  return asset?.url ?? null;
}

async function fetchPng(url: string): Promise<Buffer> {
  const response = await fetch(unwrapImageProxy(url), {
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Icon download failed (${response.status}).`);
  const body = Buffer.from(await response.arrayBuffer());
  const meta = await sharp(body).metadata();
  const image = meta.format === "svg" ? sharp(body, { density: 288 }) : sharp(body);
  return image
    .resize({ height: 1024, withoutEnlargement: meta.format !== "svg" })
    .png()
    .toBuffer();
}

/** The icon in the tone: as-is for colour, a silhouette otherwise. */
async function iconForTone(png: Buffer, tone: MarkTone): Promise<Buffer> {
  if (tone === "color") return png;
  const { hasAlpha } = await sharp(png).metadata();
  // A logo without transparency (a JPEG proxy, say) cannot be cut; the
  // original is the honest fallback rather than a solid rectangle.
  if (!hasAlpha) return png;
  return tintSilhouette(png, tone === "white" ? "#ffffff" : "#111111");
}

/**
 * The icon as satori should draw it inside a lockup: a traced vector when
 * the shape allows (any tone for a silhouette, colour only for a one-colour
 * mark), else the bitmap. A 192px favicon drawn at 260px is soft as pixels
 * and sharp as a path.
 */
async function iconSourceForTone(
  png: Buffer,
  tone: MarkTone,
): Promise<{ src: string; width: number; height: number }> {
  const meta = await sharp(png).metadata();
  const width = meta.width ?? 1;
  const height = meta.height ?? 1;
  const color =
    tone === "white" ? "#ffffff" : tone === "dark" ? "#111111" : await dominantColor(png);
  const svg = color ? await traceSilhouette(png, color).catch(() => null) : null;
  if (svg) {
    return { src: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`, width, height };
  }
  const bitmap = await iconForTone(png, tone);
  return { src: `data:image/png;base64,${bitmap.toString("base64")}`, width, height };
}

/**
 * One variant of the mark as a transparent PNG.
 *
 * Logo and favicon marks are the icon alone. A lockup sets the icon beside
 * the text in the brand's heading font, on a transparent canvas trimmed to
 * its content, so every variant of a mark has the same proportions.
 */
export async function renderBrandMark(
  recipe: BrandMarkRecipe,
  brand: MarkBrand,
  tone: MarkTone,
): Promise<Buffer> {
  const iconUrl = await resolveMarkIconUrl(recipe, brand);
  const iconPng = iconUrl ? await fetchPng(iconUrl) : null;

  if (recipe.source !== "lockup") {
    if (!iconPng) throw new Error("This brand has no logo or favicon to use.");
    return iconForTone(iconPng, tone);
  }
  const icon = iconPng ? await iconSourceForTone(iconPng, tone) : null;

  const text = (recipe.text ?? brand.name).trim() || brand.name;
  const family =
    recipe.fontFamily === undefined
      ? brandFontFamily(brand.brandIdentity)
      : recipe.fontFamily;
  const fonts = family ? await loadGoogleFont(family) : null;
  const color = markTextColor(tone, brand.brandIdentity);
  const iconSize = 260;
  const iconWidth = icon ? Math.round((iconSize * icon.width) / icon.height) : iconSize;

  const response = new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 56,
          width: "100%",
          height: "100%",
          padding: 20,
          color,
          fontSize: 200,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          whiteSpace: "nowrap",
          ...(fonts?.length ? { fontFamily: fonts[0]!.name } : {}),
        }}
      >
        {icon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={icon.src}
            alt=""
            width={iconWidth}
            height={iconSize}
            style={{ width: iconWidth, height: iconSize, objectFit: "contain" }}
          />
        ) : null}
        <div style={{ display: "flex" }}>{text}</div>
      </div>
    ),
    {
      width: 3200,
      height: 360,
      ...(fonts?.length ? { fonts } : {}),
    },
  );
  const png = Buffer.from(await response.arrayBuffer());
  return sharp(png).trim().png().toBuffer();
}

/** Render one tone for a live preview; nothing is stored. */
export async function previewBrandMark(input: {
  brandId: string;
  recipe: BrandMarkRecipe;
  tone: MarkTone;
}): Promise<Buffer> {
  const brand = await loadMarkBrand(input.brandId);
  return renderBrandMark(input.recipe, brand, input.tone);
}

/**
 * Render all three tones into the brand's library and make them the mark.
 * Re-running replaces the recipe and the variants; earlier variants stay in
 * the library as ordinary assets.
 */
export async function setBrandMark(input: {
  brandId: string;
  userId: string;
  recipe: BrandMarkRecipe;
}): Promise<BrandMark> {
  const brand = await loadMarkBrand(input.brandId);
  const tones: MarkTone[] = ["color", "white", "dark"];
  const ids: Partial<Record<MarkTone, string>> = {};
  let vector: BrandMark["vector"] = null;
  for (const tone of tones) {
    const body = await renderBrandMark(input.recipe, brand, tone);
    // An icon-only mark may come from a small file; a lockup is rendered
    // large already. Trace the mono icons so cards draw them at any size.
    if (tone === "color" && input.recipe.source !== "lockup") {
      // Best effort: the PNG variants are the mark; the vector is a bonus.
      vector = await Promise.all([
        traceSilhouette(body, "#ffffff"),
        traceSilhouette(body, "#111111"),
        dominantColor(body).then((c) => (c ? traceSilhouette(body, c) : null)),
      ])
        .then(([white, dark, color]) =>
          white && dark ? { white, dark, color: color ?? null } : null,
        )
        .catch((error: unknown) => {
          console.error("mark trace failed, keeping bitmap variants", error);
          return null;
        });
    }
    const { width, height } = await sharp(body).metadata();
    const asset = await importImageBuffer({
      brandId: brand.id,
      uploadedBy: input.userId,
      body,
      contentType: "image/png",
      filename: `${brand.name}-mark-${tone}.png`,
      title: `${brand.name} mark (${tone})`,
      width,
      height,
      metadata: { source: "brand_mark", tone, recipe: input.recipe },
    });
    ids[tone] = asset.id;
  }
  const mark: BrandMark = {
    source: input.recipe.source,
    iconAssetId: input.recipe.iconAssetId ?? null,
    iconFrom: input.recipe.iconFrom ?? null,
    text: input.recipe.text ?? null,
    fontFamily: input.recipe.fontFamily ?? null,
    variants: { color: ids.color!, white: ids.white!, dark: ids.dark! },
    vector,
    updatedAt: new Date().toISOString(),
  };
  await db.update(brandTable).set({ brandMark: mark }).where(eq(brandTable.id, brand.id));
  return mark;
}

export async function clearBrandMark(brandId: string): Promise<void> {
  await db.update(brandTable).set({ brandMark: null }).where(eq(brandTable.id, brandId));
}
