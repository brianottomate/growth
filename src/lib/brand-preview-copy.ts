import { z } from "zod";

/** Short visual-sample copy; it is not a saved ad or catalog headline. */
export const brandPreviewCopySchema = z.object({
  headline: z.string().trim().min(1).max(48),
  supportingLine: z.string().trim().min(1).max(90),
  cta: z.string().trim().min(1).max(24),
});
export type BrandPreviewCopy = z.infer<typeof brandPreviewCopySchema>;

export function brandPreviewFields(
  fields: Record<string, string>,
  copy: BrandPreviewCopy | null | undefined,
): Record<string, string> {
  if (!copy) return fields;
  return {
    ...fields,
    title: copy.headline,
    ...(Object.hasOwn(fields, "subtitle")
      ? { subtitle: copy.supportingLine }
      : {}),
    ...(Object.hasOwn(fields, "cta") ? { cta: copy.cta } : {}),
  };
}
