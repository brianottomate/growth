import "server-only";

import { and, eq, inArray, isNull } from "drizzle-orm";
import sharp from "sharp";
import { z } from "zod";
import { db } from "@/server/db";
import {
  brandTable,
  homeTable,
  mediaAssetTable,
  memberTable,
} from "@/server/db/schema";
import { R2 } from "@/server/clients/r2.client";
import { isAllowedPreviewSource } from "./composition.service";

export const brandMarkInspectionSchema = z.object({
  urls: z.object({ color: z.string(), white: z.string(), dark: z.string() }),
  photoUrl: z.string().nullable(),
  updatedAt: z.string(),
  previewPath: z.string(),
});

/** Resolve owned saved assets for identity reads on every transport. */
export async function readSavedBrandMarkInspection(input: {
  brandId: string;
  userId: string;
  orgId: string;
}) {
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, input.brandId),
      eq(brandTable.organizationId, input.orgId),
      isNull(brandTable.deletedAt),
    ),
    columns: {
      slug: true,
      brandMark: true,
      previewSourceUrl: true,
      featuredListingUrl: true,
      brandIdentity: true,
      websiteMeta: true,
    },
  });
  const member =
    brand &&
    (await db.query.memberTable.findFirst({
      where: and(
        eq(memberTable.userId, input.userId),
        eq(memberTable.organizationId, input.orgId),
      ),
      columns: { id: true },
    }));
  if (!brand || !member)
    throw new Error("Brand not found in this organization.");
  const variants = brand.brandMark?.variants;
  if (!variants)
    throw new Error(
      "This brand has no saved creative mark. Read its identity before choosing a recipe.",
    );
  const assets = await db.query.mediaAssetTable.findMany({
    where: and(
      inArray(mediaAssetTable.id, Object.values(variants)),
      eq(mediaAssetTable.brandId, input.brandId),
      eq(mediaAssetTable.kind, "image"),
      eq(mediaAssetTable.status, "ready"),
      isNull(mediaAssetTable.deletedAt),
    ),
    columns: { id: true, url: true },
  });
  const byId = new Map(assets.map((asset) => [asset.id, asset.url]));
  const featuredHome =
    !brand.previewSourceUrl && brand.featuredListingUrl
      ? await db.query.homeTable.findFirst({
          where: and(
            eq(homeTable.brandId, input.brandId),
            eq(homeTable.url, brand.featuredListingUrl),
            isNull(homeTable.deletedAt),
          ),
          columns: { heroSourceUrl: true },
        })
      : null;
  const photoUrl =
    brand.previewSourceUrl ??
    featuredHome?.heroSourceUrl ??
    brand.brandIdentity?.raw?.images?.ogImage ??
    brand.websiteMeta?.ogImage;
  return brandMarkInspectionSchema.parse({
    urls: Object.fromEntries(
      ["color", "white", "dark"].map((tone) => [
        tone,
        byId.get(variants[tone as keyof typeof variants]),
      ]),
    ),
    photoUrl: photoUrl ?? null,
    updatedAt: brand.brandMark!.updatedAt,
    previewPath: brand.slug ? `/app/brands/${brand.slug}` : "/app/brands",
  });
}

/** Compose public saved image references into the sheet delivered to the model. */
export async function renderSavedBrandMarkInspection(
  inspection: z.infer<typeof brandMarkInspectionSchema>,
) {
  const { photoUrl } = inspection;
  const tones = ["color", "white", "dark"] as const;
  const buffers = await Promise.all(
    tones.map(async (tone) => {
      const url = inspection.urls[tone];
      if (!url || !R2.isPublicUrl(url))
        throw new Error(
          `The saved ${tone} mark is unavailable in this brand's library.`,
        );
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok)
        throw new Error(
          `The saved ${tone} mark could not be downloaded (${response.status}).`,
        );
      return Buffer.from(await response.arrayBuffer());
    }),
  );
  const panels: Buffer[] = [];
  const warnings: string[] = [];
  const panel = async (mark: Buffer, background: string | Buffer) => {
    const base =
      typeof background === "string"
        ? sharp({
            create: { width: 900, height: 140, channels: 3, background },
          })
        : sharp(background).rotate().resize(900, 140, { fit: "cover" });
    const icon = await sharp(mark)
      .resize({ width: 820, height: 72, fit: "inside" })
      .png()
      .toBuffer();
    const size = await sharp(icon).metadata();
    return base
      .composite([
        {
          input: icon,
          left: 40,
          top: 34 + Math.floor((72 - (size.height ?? 72)) / 2),
        },
      ])
      .png()
      .toBuffer();
  };
  for (let i = 0; i < tones.length; i++)
    panels.push(
      await panel(buffers[i]!, tones[i] === "white" ? "#222222" : "#ffffff"),
    );
  let onPhoto = false;
  if (photoUrl && isAllowedPreviewSource(photoUrl)) {
    try {
      const response = await fetch(photoUrl, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok)
        throw new Error(`Photo download failed (${response.status}).`);
      panels.push(
        await panel(buffers[1]!, Buffer.from(await response.arrayBuffer())),
      );
      onPhoto = true;
    } catch {
      warnings.push(
        "The selected preview photo could not be rendered; photo contrast remains unverified.",
      );
    }
  } else
    warnings.push(
      "No supported preview photo is selected; photo contrast remains unverified.",
    );
  const image = await sharp({
    create: {
      width: 900,
      height: panels.length * 140,
      channels: 3,
      background: "#ffffff",
    },
  })
    .composite(panels.map((png, i) => ({ input: png, left: 0, top: i * 140 })))
    .png()
    .toBuffer();
  return { image, onPhoto, warnings };
}
