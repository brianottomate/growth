import { z } from "zod";

/** Wire results for this capability. Dates are ISO strings after JSON normalization. */
export const browseDriveOutputSchema = z.strictObject({
  count: z.number(),
  files: z.array(
    z.strictObject({
      bytes: z.number().optional(),
      dimensions: z.string().optional(),
      fileId: z.string(),
      isFolder: z.boolean(),
      mimeType: z.string(),
      name: z.string(),
    }),
  ),
  next: z.string(),
});

export const readDriveDocumentOutputSchema = z.strictObject({
  characters: z.number(),
  mimeType: z.string(),
  name: z.string(),
  text: z.string(),
});

export const driveConnectionStatusOutputSchema = z.strictObject({
  accountId: z.string().nullable(),
  configured: z.boolean(),
  connected: z.boolean(),
  hint: z.string(),
  needsConsent: z.boolean(),
});

export const importDriveFilesToContentOutputSchema = z.strictObject({
  contentPostId: z.string(),
  failures: z.array(z.strictObject({ fileId: z.string(), reason: z.string() })),
  mediaAssetIds: z.array(z.string()),
  mediaCount: z.number(),
  next: z.string(),
  ok: z.boolean(),
  url: z.string(),
});
