import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "../db";
import { accountTable } from "../db/schema";
import { auth } from "../better-auth";
import { env } from "@/env";
import {
  DRIVE_READONLY_SCOPE,
  isDriveFolder,
  resizeDriveThumbnail,
  sortDriveFiles,
  type DriveFile,
} from "@/lib/google-drive";
import { GoogleDrive, GoogleDriveError } from "../clients/google-drive.client";
import { MediaService } from "./media.service";

const THUMBNAIL_EDGE = 640;

/**
 * Google Drive rides on the existing better-auth Google account rather than a
 * bespoke connection table: the user already signs in with their Wander
 * account, so "connect Drive" is an incremental-consent re-link that adds the
 * Drive scope to that same account row. better-auth owns the token exchange,
 * encryption-at-rest policy and refresh, which is why there is no OAuth
 * callback route in this file.
 */
export function isDriveConfigured(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

export type DriveConnection = {
  configured: boolean;
  connected: boolean;
  /** Signed in with Google but hasn't granted the Drive scope yet. */
  needsConsent: boolean;
  accountId: string | null;
};

export async function driveConnection(
  userId: string,
): Promise<DriveConnection> {
  const configured = isDriveConfigured();
  if (!configured) {
    return {
      configured,
      connected: false,
      needsConsent: false,
      accountId: null,
    };
  }

  const account = await db.query.accountTable.findFirst({
    where: and(
      eq(accountTable.userId, userId),
      eq(accountTable.providerId, "google"),
    ),
    columns: { id: true, scope: true },
  });

  const granted = (account?.scope ?? "").split(/[\s,]+/).filter(Boolean);
  const hasScope = granted.includes(DRIVE_READONLY_SCOPE);
  return {
    configured,
    connected: Boolean(account) && hasScope,
    needsConsent: Boolean(account) && !hasScope,
    accountId: account?.id ?? null,
  };
}

/**
 * A valid Drive access token for this user.
 *
 * better-auth refreshes behind `getAccessToken`, so callers never touch the
 * refresh token or track expiry themselves.
 */
async function driveAccessToken(userId: string): Promise<string> {
  const connection = await driveConnection(userId);
  if (!connection.configured) {
    throw new GoogleDriveError("Google Drive is not configured.");
  }
  if (!connection.connected) {
    throw new GoogleDriveError(
      "Google Drive isn't connected for this account yet.",
      401,
      "not_connected",
    );
  }

  const token = await auth.api
    .getAccessToken({ body: { providerId: "google", userId } })
    .catch((error: unknown) => {
      throw new GoogleDriveError(
        error instanceof Error
          ? `Could not refresh Google access: ${error.message}`
          : "Could not refresh Google access.",
        401,
        "refresh_failed",
      );
    });

  if (!token?.accessToken) {
    throw new GoogleDriveError(
      "Google did not return an access token; reconnect Drive.",
      401,
      "refresh_failed",
    );
  }
  return token.accessToken;
}

/** Browse or search the user's Drive for images Growth can rehost. */
export async function browseDrive(input: {
  userId: string;
  folderId?: string;
  search?: string;
  includeFolders?: boolean;
  limit?: number;
}): Promise<DriveFile[]> {
  const accessToken = await driveAccessToken(input.userId);
  return GoogleDrive.list(accessToken, {
    ...(input.folderId ? { folderId: input.folderId } : {}),
    ...(input.search ? { search: input.search } : {}),
    includeFolders: input.includeFolders ?? true,
    ...(input.limit ? { limit: input.limit } : {}),
  });
}

/**
 * Copy Drive files into a brand's media library.
 *
 * Rehosting rather than linking is deliberate: Drive URLs need the *viewer's*
 * credentials, so a linked asset would break for teammates and for anything
 * server-side. Input order is preserved so importing a folder yields a
 * carousel in the intended sequence.
 */
export async function importDriveFiles(input: {
  userId: string;
  brandId: string;
  fileIds: string[];
}) {
  const accessToken = await driveAccessToken(input.userId);
  const imported: Awaited<ReturnType<typeof MediaService.importImageBuffer>>[] =
    [];
  const failures: { fileId: string; reason: string }[] = [];

  for (const fileId of input.fileIds) {
    try {
      const meta = await GoogleDrive.get(accessToken, fileId);
      if (isDriveFolder(meta)) {
        failures.push({ fileId, reason: `${meta.name} is a folder.` });
        continue;
      }

      const file = await GoogleDrive.download(accessToken, fileId);
      // Drive already has a rendered tile — cheaper and sharper than
      // re-encoding the original server-side, and it keeps the grid fast.
      const thumbnail = meta.thumbnailLink
        ? await GoogleDrive.downloadThumbnail(
            accessToken,
            resizeDriveThumbnail(meta.thumbnailLink, THUMBNAIL_EDGE),
          )
        : null;

      imported.push(
        await MediaService.importImageBuffer({
          brandId: input.brandId,
          uploadedBy: input.userId,
          body: file.body,
          contentType: file.contentType,
          filename: meta.name,
          title: meta.name,
          ...(meta.width ? { width: meta.width } : {}),
          ...(meta.height ? { height: meta.height } : {}),
          ...(thumbnail ? { thumbnail } : {}),
          ...(meta.webViewLink ? { externalUrl: meta.webViewLink } : {}),
          sourceProvider: "google_drive",
          metadata: {
            source: "google_drive",
            driveFileId: meta.id,
            driveModifiedTime: meta.modifiedTime ?? null,
          },
        }),
      );
    } catch (error) {
      failures.push({
        fileId,
        reason: error instanceof Error ? error.message : "Import failed.",
      });
    }
  }

  return { imported, failures };
}

/** Import every image directly inside a Drive folder, in reading order. */
export async function importDriveFolder(input: {
  userId: string;
  brandId: string;
  folderId: string;
  limit?: number;
}) {
  const files = await browseDrive({
    userId: input.userId,
    folderId: input.folderId,
    includeFolders: false,
    ...(input.limit ? { limit: input.limit } : {}),
  });
  const ordered = sortDriveFiles(files).filter((file) => !isDriveFolder(file));
  return importDriveFiles({
    userId: input.userId,
    brandId: input.brandId,
    fileIds: ordered.map((file) => file.id),
  });
}

export const GoogleDriveService = {
  isConfigured: isDriveConfigured,
  connection: driveConnection,
  browse: browseDrive,
  importFiles: importDriveFiles,
  importFolder: importDriveFolder,
} as const;
