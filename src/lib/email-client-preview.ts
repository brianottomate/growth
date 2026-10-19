import { z } from "zod";

export const createEmailPreviewInput = z.object({
  brandId: z.string().min(1),
  platformPostIds: z.array(z.string().min(1).max(80)).min(1).max(24),
  expiresInDays: z.number().int().min(1).max(90).default(30),
});
export type EmailClientEdition = {
  id: string;
  subject: string;
  preheader: string | null;
  series: string | null;
  plannedAt: string | null;
  html: string;
};
export type EmailClientPreview = {
  brandName: string;
  expiresAt: string;
  editions: EmailClientEdition[];
};
