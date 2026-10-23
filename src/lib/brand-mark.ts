import { z } from "zod";
import { brandPreviewCopySchema } from "./brand-preview-copy";

/**
 * The mark a brand's cards carry, chosen by an operator rather than scraped.
 * `variants` are library assets rendered from the recipe: the colour version,
 * a white silhouette for photos, a near-black one for light grounds.
 */
export const brandMarkSchema = z.strictObject({
  previewCopy: brandPreviewCopySchema.nullable().optional(),
  source: z.enum(["logo", "favicon", "lockup"]),
  /** Lockup only: the icon beside the name, a library asset. */
  iconAssetId: z.string().nullable().optional(),
  /** Lockup only: the icon taken from the scraped logo or favicon instead. */
  /** "logo-icon": the logo's leading glyph, isolated from its wordmark. */
  iconFrom: z.enum(["logo", "favicon", "logo-icon"]).nullable().optional(),
  /** Lockup only: the wordmark text. Defaults to the brand name. */
  text: z.string().nullable().optional(),
  /** Lockup only: the family the text is set in; null means the house font. */
  fontFamily: z.string().nullable().optional(),
  /** Lockup only: the wordmark weight; null means 700. */
  fontWeight: z
    .union([z.literal(400), z.literal(500), z.literal(600), z.literal(700)])
    .nullable()
    .optional(),
  /** Lockup only: tracking in em; null means -0.02. */
  letterSpacing: z.number().nullable().optional(),
  /** Why this mark, when "Suggest a mark" chose it. */
  reason: z.string().nullable().optional(),
  variants: z.strictObject({
    color: z.string(),
    white: z.string(),
    dark: z.string(),
  }),
  /**
   * The mark traced to SVG, when the shape traces cleanly: white and dark
   * always, colour only when the mark is drawn in a single colour.
   */
  vector: z
    .strictObject({
      white: z.string(),
      dark: z.string(),
      color: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  /**
   * An art director's corrections to the measured lockup, in cap heights, from
   * a vision pass over the first render. Stored so every tone and every later
   * render agrees with what was judged.
   */
  tuning: z
    .strictObject({
      iconScale: z.number(),
      iconShift: z.number(),
      gapScale: z.number(),
      note: z.string(),
    })
    .nullable()
    .optional(),
  updatedAt: z.string(),
});
export type BrandMark = z.infer<typeof brandMarkSchema>;
