/**
 * Shared Google Drive vocabulary — safe for both client and server bundles.
 *
 * The connector is read-only by design: Growth pulls creative *out* of Drive
 * and rehosts it in R2, and never writes back. Keeping the scope list here (as
 * opposed to inline at the call site) means the UI can show exactly what it is
 * about to ask for.
 */

/**
 * Read-only access to the user's Drive. This is a Google "restricted" scope,
 * which is only cheap because the OAuth consent screen is Internal — a
 * Workspace-only app skips the third-party security assessment that external
 * apps need for this scope.
 */
export const DRIVE_READONLY_SCOPE =
  "https://www.googleapis.com/auth/drive.readonly";

/**
 * Drive is a *separate* linked account from Google sign-in, registered through
 * better-auth's generic-OAuth plugin with its own client credentials.
 *
 * Keeping them apart matters for two concrete reasons. Google revocation is
 * per-app-grant, not per-scope — sharing a client means revoking Drive access
 * also kills the refresh token that signs you in. And with account linking
 * enabled, adding Drive to the sign-in provider would give email/password
 * users a Google login they never asked for. Connecting a file source must not
 * change how anyone authenticates.
 */
export const DRIVE_PROVIDER_ID = "google-drive";

/** Image types Growth can rehost. Mirrors the media library's own list. */
export const DRIVE_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
] as const;

export const DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

/**
 * File types `readDocument` can turn into text. Google's own formats hold no
 * bytes and are exported; the rest are downloaded and decoded as UTF-8.
 */
export const DRIVE_DOCUMENT_MIME_TYPES = [
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.spreadsheet",
  "application/vnd.google-apps.presentation",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
] as const;

/**
 * Accept what a person actually has to hand: a bare file id, or any of the
 * Drive/Docs/Sheets/Slides URL shapes they copy out of the address bar.
 */
export function parseDriveFileId(input: string): string {
  const value = input.trim();
  if (!value.includes("/")) return value;
  const patterns = [
    /\/(?:document|spreadsheets|presentation|file)\/d\/([a-zA-Z0-9_-]{10,})/,
    /[?&]id=([a-zA-Z0-9_-]{10,})/,
    /\/folders\/([a-zA-Z0-9_-]{10,})/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(value);
    if (match?.[1]) return match[1];
  }
  return value;
}

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  width?: number;
  height?: number;
  thumbnailLink?: string;
  webViewLink?: string;
  modifiedTime?: string;
};

/** A Drive `q` string literal — single quotes and backslashes must be escaped. */
export function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * Build the `q` parameter for a Drive file listing.
 *
 * Always excludes trashed files and restricts to types we can actually rehost
 * (plus folders when browsing), so the caller can't accidentally ask Drive for
 * a 4 GB video and then fail at download time.
 */
export function buildDriveQuery(options: {
  /** Restrict to the direct children of this folder. */
  folderId?: string;
  /** Substring match on the file name. */
  search?: string;
  /** Include folders alongside images (for a browsable listing). */
  includeFolders?: boolean;
  /** Include Docs/Sheets/Slides/text, which readDocument can read. */
  includeDocuments?: boolean;
  /** Drop images, for a documents-only listing. */
  excludeImages?: boolean;
}): string {
  const clauses = ["trashed = false"];

  const mimeTypes: string[] = [
    ...(options.excludeImages ? [] : DRIVE_IMAGE_MIME_TYPES),
    ...(options.includeDocuments ? DRIVE_DOCUMENT_MIME_TYPES : []),
    ...(options.includeFolders ? [DRIVE_FOLDER_MIME_TYPE] : []),
  ];
  const types = mimeTypes.map((mime) => `mimeType = '${mime}'`);
  clauses.push(`(${types.join(" or ")})`);

  if (options.folderId) {
    clauses.push(`'${escapeDriveQueryValue(options.folderId)}' in parents`);
  }
  if (options.search?.trim()) {
    clauses.push(
      `name contains '${escapeDriveQueryValue(options.search.trim())}'`,
    );
  }
  return clauses.join(" and ");
}

export function isDriveFolder(file: { mimeType: string }): boolean {
  return file.mimeType === DRIVE_FOLDER_MIME_TYPE;
}

/**
 * Ask Drive for a specific thumbnail width. `thumbnailLink` comes back with a
 * trailing `=s220` sizing suffix; swapping it is the documented way to get a
 * larger tile without downloading the original.
 */
export function resizeDriveThumbnail(link: string, size: number): string {
  return link.replace(/=s\d+(-c)?$/, `=s${size}`);
}

/**
 * Order files the way a person would read them in a folder — "slide-2" before
 * "slide-10" — so a Drive folder imported as a carousel keeps its intended
 * sequence. Folders sort ahead of files when both are present.
 */
export function sortDriveFiles<T extends { name: string; mimeType: string }>(
  files: readonly T[],
): T[] {
  const collator = new Intl.Collator("en", {
    numeric: true,
    sensitivity: "base",
  });
  return [...files].sort((a, b) => {
    const aFolder = isDriveFolder(a);
    const bFolder = isDriveFolder(b);
    if (aFolder !== bFolder) return aFolder ? -1 : 1;
    return collator.compare(a.name, b.name);
  });
}
