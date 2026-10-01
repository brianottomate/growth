import { z } from "zod";

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/** Email-safe inline colors. Defaults are neutral, never another brand's identity. */
export const brandEmailThemeSchema = z.strictObject({
  backgroundColor: color.optional(),
  accentColor: color.optional(),
  accentTextColor: color.optional(),
});
export type BrandEmailTheme = z.infer<typeof brandEmailThemeSchema>;

export function emailCopyGuidance(brand: {
  name: string;
  emailSender?: { copyGuide?: string | null } | null;
}) {
  return [
    `Use only ${brand.name}'s identity and supplied facts. Do not borrow another brand's tagline, concierge promises, discounts or voice.`,
    brand.emailSender?.copyGuide?.trim()
      ? `Email copy guide for ${brand.name}:\n${brand.emailSender.copyGuide.trim()}`
      : null,
    "Do not use em dashes or en dashes as sentence punctuation. Use a period or comma. For a property blast, keep prose outside the home cards under 100 words: one short opening and at most one short closing. Keep home notes to one sentence, ideally under 15 words. Do not repeat the subject as body copy.",
    "Keep the opening to one or two short paragraphs. Avoid repeating the same amenities in the subject, intro and every home card. A home's guest count is its capacity, not evidence it is designed for a particular party size.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
