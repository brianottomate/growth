import "server-only";

import { z } from "zod";

import { GoogleDriveService } from "@/server/services/google-drive.service";
import { isDriveFolder } from "@/lib/google-drive";
import { growthAction } from "./types";

/**
 * Read-only Drive discovery.
 *
 * Deliberately a *primitive*: it resolves names to file IDs and nothing else.
 * Importing is a separate, explicit write on the content domain, so a caller
 * composing "find the folder, then import it" always sees both steps.
 */
export const browseDrive = growthAction({
  description:
    "Browse or search the operator's connected Google Drive for images Growth can import. Returns file IDs, names and whether each row is a folder — pass a folderId to descend into one. Use the returned fileIds with contentMediaWrite.importFromDrive. Requires the operator to have connected Drive in Growth.",
  inputSchema: z.object({
    folderId: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .optional()
      .describe("Descend into this folder instead of listing the Drive root."),
    search: z
      .string()
      .trim()
      .max(200)
      .optional()
      .describe("Match file names containing this text."),
    limit: z.number().int().min(1).max(100).default(50),
  }),
  execute: async ({ folderId, search, limit }, ctx) => {
    const files = await GoogleDriveService.browse({
      userId: ctx.userId,
      ...(folderId ? { folderId } : {}),
      ...(search ? { search } : {}),
      includeFolders: true,
      limit,
    });
    return {
      files: files.map((file) => ({
        fileId: file.id,
        name: file.name,
        isFolder: isDriveFolder(file),
        ...(file.size ? { bytes: file.size } : {}),
        ...(file.width && file.height
          ? { dimensions: `${file.width}x${file.height}` }
          : {}),
      })),
      count: files.length,
      next: "Pass the image fileIds (in slide order) to contentMediaWrite.importFromDrive, or call again with a folderId to descend.",
    };
  },
});

export const driveConnectionStatus = growthAction({
  description:
    "Check whether the operator has connected Google Drive to Growth, before attempting a Drive browse or import.",
  inputSchema: z.object({}),
  execute: async (_input, ctx) => {
    const connection = await GoogleDriveService.connection(ctx.userId);
    return {
      ...connection,
      hint: connection.connected
        ? "Drive is connected; browse or import freely."
        : connection.configured
          ? "Ask the operator to open /app/media and click Drive → Connect Google Drive."
          : "Google Drive is not configured in this environment.",
    };
  },
});
