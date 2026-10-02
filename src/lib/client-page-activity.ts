import { z } from "zod";
export const clientPageSurfaceSchema = z.enum([
  "pitch",
  "intake",
  "social_connect",
  "email_dns",
]);
export type ClientPageSurface = z.infer<typeof clientPageSurfaceSchema>;
export const clientPageViewSchema = z.object({
  surface: clientPageSurfaceSchema,
  handle: z.string().min(1).max(200),
  visitId: z.string().uuid(),
});
