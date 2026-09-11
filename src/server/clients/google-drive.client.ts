import "server-only";

import {
  buildDriveQuery,
  sortDriveFiles,
  type DriveFile,
} from "@/lib/google-drive";

const DRIVE_ROOT = "https://www.googleapis.com/drive/v3";
/** Same ceiling the media library enforces on direct uploads. */
const MAX_DRIVE_FILE_BYTES = 25 * 1024 * 1024;
// An exported Doc is prompt material, so cap it at something a model can read.
const MAX_DRIVE_TEXT_CHARS = 200_000;

export class GoogleDriveError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly reason?: string,
  ) {
    super(message);
    this.name = "GoogleDriveError";
  }
}

type DriveFileResource = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  thumbnailLink?: string;
  webViewLink?: string;
  modifiedTime?: string;
  imageMediaMetadata?: { width?: number; height?: number };
};

/**
 * Thin authenticated fetch against Drive v3.
 *
 * Absolute URLs are accepted so paginated follow-ups can be fed straight back
 * in, but the origin is asserted first — a spoofed next-page URL must not be
 * able to walk off with the bearer token.
 */
async function driveRequest<T>(
  accessToken: string,
  pathOrUrl: string,
  init: RequestInit = {},
): Promise<T> {
  const url = pathOrUrl.startsWith("https://")
    ? pathOrUrl
    : `${DRIVE_ROOT}${pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`}`;
  if (new URL(url).origin !== new URL(DRIVE_ROOT).origin) {
    throw new GoogleDriveError("Drive request must target googleapis.com");
  }

  const response = await fetch(url, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${accessToken}`,
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string; errors?: { reason?: string }[] };
    } | null;
    throw new GoogleDriveError(
      body?.error?.message ?? `Drive request failed (${response.status})`,
      response.status,
      body?.error?.errors?.[0]?.reason,
    );
  }
  return (await response.json()) as T;
}

function toDriveFile(resource: DriveFileResource): DriveFile {
  return {
    id: resource.id,
    name: resource.name,
    mimeType: resource.mimeType,
    ...(resource.size ? { size: Number(resource.size) } : {}),
    ...(resource.imageMediaMetadata?.width
      ? { width: resource.imageMediaMetadata.width }
      : {}),
    ...(resource.imageMediaMetadata?.height
      ? { height: resource.imageMediaMetadata.height }
      : {}),
    ...(resource.thumbnailLink
      ? { thumbnailLink: resource.thumbnailLink }
      : {}),
    ...(resource.webViewLink ? { webViewLink: resource.webViewLink } : {}),
    ...(resource.modifiedTime ? { modifiedTime: resource.modifiedTime } : {}),
  };
}

/**
 * List images (and optionally folders) the user can see, newest Drive page
 * first, then ordered for human reading. `supportsAllDrives` means shared
 * drives are visible too — most brand creative lives in one.
 */
export async function listDriveFiles(
  accessToken: string,
  options: {
    folderId?: string;
    search?: string;
    includeFolders?: boolean;
    includeDocuments?: boolean;
    excludeImages?: boolean;
    limit?: number;
  } = {},
): Promise<DriveFile[]> {
  const limit = Math.min(options.limit ?? 100, 200);
  const params = new URLSearchParams({
    q: buildDriveQuery(options),
    pageSize: String(limit),
    fields:
      "files(id,name,mimeType,size,thumbnailLink,webViewLink,modifiedTime,imageMediaMetadata(width,height))",
    orderBy: "folder,name_natural",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
    corpora: "allDrives",
  });

  const page = await driveRequest<{ files?: DriveFileResource[] }>(
    accessToken,
    `/files?${params.toString()}`,
  );
  return sortDriveFiles((page.files ?? []).map(toDriveFile));
}

/** Metadata for one file — used to validate before spending a download. */
export async function getDriveFile(
  accessToken: string,
  fileId: string,
): Promise<DriveFile> {
  const params = new URLSearchParams({
    fields:
      "id,name,mimeType,size,thumbnailLink,webViewLink,modifiedTime,imageMediaMetadata(width,height)",
    supportsAllDrives: "true",
  });
  const resource = await driveRequest<DriveFileResource>(
    accessToken,
    `/files/${encodeURIComponent(fileId)}?${params.toString()}`,
  );
  return toDriveFile(resource);
}

/**
 * Native Google file types hold no bytes of their own, so `alt=media` returns
 * a 403 for them. They have to be exported to a concrete format instead, and
 * the export endpoint is a different path with a different parameter.
 */
const GOOGLE_EXPORT_TYPES: Record<string, string> = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
};

export function isGoogleNativeFile(mimeType: string | null | undefined) {
  return Boolean(mimeType && mimeType in GOOGLE_EXPORT_TYPES);
}

/**
 * Read a Google Doc, Sheet or Slides file as text.
 *
 * Separate from `downloadDriveFile` on purpose: that one returns raw bytes for
 * an asset, this one returns an export of something that has no raw bytes.
 * Collapsing them would hide which files can be read as text.
 */
export async function exportDriveFileAsText(
  accessToken: string,
  fileId: string,
  mimeType: string,
): Promise<string> {
  const exportType = GOOGLE_EXPORT_TYPES[mimeType];
  if (!exportType) {
    throw new GoogleDriveError(
      `Drive file type cannot be exported as text: ${mimeType}`,
    );
  }
  const params = new URLSearchParams({
    mimeType: exportType,
    supportsAllDrives: "true",
  });
  const response = await fetch(
    `${DRIVE_ROOT}/files/${encodeURIComponent(fileId)}/export?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(60_000),
    },
  );
  if (!response.ok) {
    throw new GoogleDriveError(
      `Drive export failed (${response.status})`,
      response.status,
    );
  }
  const text = await response.text();
  if (text.length > MAX_DRIVE_TEXT_CHARS) {
    return text.slice(0, MAX_DRIVE_TEXT_CHARS);
  }
  return text;
}

/** Download a file's bytes. Size-capped so one huge asset can't blow up a job. */
export async function downloadDriveFile(
  accessToken: string,
  fileId: string,
): Promise<{ body: Buffer; contentType: string }> {
  const url = `${DRIVE_ROOT}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new GoogleDriveError(
      `Drive download failed (${response.status})`,
      response.status,
    );
  }

  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_DRIVE_FILE_BYTES) {
    throw new GoogleDriveError("Drive file exceeds 25 MB.");
  }
  const body = Buffer.from(await response.arrayBuffer());
  if (body.byteLength > MAX_DRIVE_FILE_BYTES) {
    throw new GoogleDriveError("Drive file exceeds 25 MB.");
  }
  return {
    body,
    contentType:
      response.headers.get("content-type")?.split(";")[0]?.toLowerCase() ??
      "application/octet-stream",
  };
}

/**
 * Drive thumbnails need the same bearer token as the file itself, so this
 * can't be handed to the browser as a plain URL — we fetch and rehost it.
 */
export async function downloadDriveThumbnail(
  accessToken: string,
  link: string,
): Promise<{ body: Buffer; contentType: string } | null> {
  try {
    const response = await fetch(link, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return null;
    const contentType =
      response.headers.get("content-type")?.split(";")[0]?.toLowerCase() ?? "";
    if (!contentType.startsWith("image/")) return null;
    return { body: Buffer.from(await response.arrayBuffer()), contentType };
  } catch {
    return null;
  }
}

export const GoogleDrive = {
  list: listDriveFiles,
  get: getDriveFile,
  download: downloadDriveFile,
  exportText: exportDriveFileAsText,
  isNative: isGoogleNativeFile,
  downloadThumbnail: downloadDriveThumbnail,
} as const;
