import { z } from "zod";

export const sourceStoryboardSectionSchema = z.object({
  index: z.number().int().nonnegative(),
  tag: z.string(),
  role: z.string().nullable(),
  label: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
  headingCount: z.number().int().nonnegative(),
  imageCount: z.number().int().nonnegative(),
  linkCount: z.number().int().nonnegative(),
  backgroundImage: z.string().nullable(),
});

export const sourceGeometrySchema = z.object({
  version: z.literal("source-geometry/v1"),
  viewport: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
  document: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    horizontalOverflow: z.boolean(),
  }),
  sections: z.array(sourceStoryboardSectionSchema),
});

export const sourceVisualCaptureSchema = z.object({
  viewport: z.enum(["desktop", "mobile"]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fullPage: z.literal(true),
  screenshotUrl: z.string().url(),
  screenshotKey: z.string(),
  sha256: z.string(),
  contentType: z.string(),
  bytes: z.number().int().positive(),
  geometry: sourceGeometrySchema,
});

export const pregenSourceVisualReceiptSchema = z.object({
  version: z.literal("source-visual/v1"),
  buildId: z.string(),
  crawlPageId: z.string(),
  requestedUrl: z.string().url(),
  finalUrl: z.string().url(),
  capturedAt: z.string().datetime(),
  engine: z.literal("firecrawl-v2"),
  captures: z.array(sourceVisualCaptureSchema).min(1),
});

export type PregenSourceVisualReceipt = z.infer<
  typeof pregenSourceVisualReceiptSchema
>;

export function parsePregenSourceVisualReceipt(
  value: unknown,
): PregenSourceVisualReceipt | null {
  const result = pregenSourceVisualReceiptSchema.safeParse(value);
  return result.success ? result.data : null;
}
