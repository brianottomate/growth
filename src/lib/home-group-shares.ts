import { z } from "zod";

export const saveHomeGroupShareInput = z.object({
  id: z.string().min(1).optional(),
  title: z.string().trim().min(1).max(120),
  homeIds: z
    .array(z.string().min(1))
    .min(1)
    .max(1000)
    .refine(
      (ids) => new Set(ids).size === ids.length,
      "Select each home only once.",
    ),
  expectedRevision: z.number().int().nonnegative().optional(),
});

export const homeGroupShareRevisionInput = z.object({
  id: z.string().min(1),
  expectedRevision: z.number().int().nonnegative(),
});

export const shareExistingHomeGroupInput = homeGroupShareRevisionInput.extend({
  title: z.string().trim().min(1).max(120),
});

/** Browser-rendered URLs only. Never fetch arbitrary listing/photos on the server. */
export function safeHomeGroupShareUrl(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed) || /[\u0000-\u0020\u007f\\]/.test(trimmed))
    return null;
  try {
    const url = new URL(trimmed);
    if (!url.hostname || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

export const publicHomeGroupSchema = z.object({
  title: z.string(),
  homes: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      photoUrl: z.string().nullable(),
      location: z.string().nullable(),
      url: z.string().nullable(),
    }),
  ),
});
export type PublicHomeGroup = z.infer<typeof publicHomeGroupSchema>;
