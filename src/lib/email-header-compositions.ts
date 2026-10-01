import { z } from "zod";
import { COMPOSITION_TEMPLATES } from "./compositions";

/** Photo-based layouts suited to an email header, using the shared renderer. */
export const emailHeaderTemplateIdSchema = z.enum([
  "photo-only",
  "email-header",
  "image-hero",
  "split-frame",
  "editorial-overlay",
]);
export type EmailHeaderTemplateId = z.infer<typeof emailHeaderTemplateIdSchema>;
export const EMAIL_HEADER_TEMPLATES = COMPOSITION_TEMPLATES.filter(
  (template) => emailHeaderTemplateIdSchema.safeParse(template.id).success,
);
export function emailHeaderTemplateId(value: unknown): EmailHeaderTemplateId {
  const parsed = emailHeaderTemplateIdSchema.safeParse(value);
  return parsed.success ? parsed.data : "email-header";
}

export const emailHeaderFormatIdSchema = z.enum(["banner", "email", "square"]);
export type EmailHeaderFormatId = z.infer<typeof emailHeaderFormatIdSchema>;
export const EMAIL_HEADER_SHAPES = [
  { id: "original", label: "Original photo" },
  { id: "banner", label: "Landscape · 2:1" },
  { id: "email", label: "Landscape · 3:2" },
  { id: "square", label: "Square · 1:1" },
] as const;
export type EmailHeaderShape = (typeof EMAIL_HEADER_SHAPES)[number]["id"];
