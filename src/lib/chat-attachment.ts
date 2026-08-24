export const CHAT_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
] as const;

export const CHAT_VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const;

export const MAX_CHAT_ATTACHMENTS = 10;
export const MAX_CHAT_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_CHAT_VIDEO_BYTES = 250 * 1024 * 1024;

export function isChatAttachmentMediaType(mediaType: string): boolean {
  return (
    (CHAT_IMAGE_MIME_TYPES as readonly string[]).includes(mediaType) ||
    (CHAT_VIDEO_MIME_TYPES as readonly string[]).includes(mediaType)
  );
}

export function maxChatAttachmentBytes(mediaType: string): number | null {
  if ((CHAT_IMAGE_MIME_TYPES as readonly string[]).includes(mediaType)) {
    return MAX_CHAT_IMAGE_BYTES;
  }
  if ((CHAT_VIDEO_MIME_TYPES as readonly string[]).includes(mediaType)) {
    return MAX_CHAT_VIDEO_BYTES;
  }
  return null;
}

export function isOwnedChatAttachmentPath(
  pathname: string,
  userId: string,
): boolean {
  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, "-") || "misc";
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const prefix = `/uploads/chat/${safeUserId}/`;
  if (!normalized.startsWith(prefix)) return false;
  const filename = normalized.slice(prefix.length);
  return (
    Boolean(filename) && !filename.includes("/") && !filename.includes("\\")
  );
}

/**
 * True when a chat-attachment URL is one WE host (public R2 bucket) AND lives
 * under the calling operator's own chat-upload prefix. Chat images are written
 * by `MediaService.createChatR2Upload` to
 * `R2.buildUploadKey("chat", userId, …)`, i.e.
 * `…/uploads/chat/{userId}/…` under `R2_PUBLIC_BASE_URL`.
 *
 * Reads `process.env` directly (not `@/env`) so this stays a dependency-free
 * pure helper that unit tests can exercise. Fails closed when the public base
 * URL is not configured.
 */
export function isOwnedChatAttachmentUrl(url: string, userId: string): boolean {
  const base = process.env.R2_PUBLIC_BASE_URL;
  if (!base) return false;
  try {
    const baseUrl = new URL(base);
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === baseUrl.hostname &&
      isOwnedChatAttachmentPath(parsed.pathname, userId)
    );
  } catch {
    return false;
  }
}

export const isOwnedChatImagePath = isOwnedChatAttachmentPath;
export const isOwnedChatImageUrl = isOwnedChatAttachmentUrl;

export type ChatImageReference = {
  url: string;
  mediaType: string;
};

export type ChatMediaReference = ChatImageReference & { title?: string };

type ChatMessageLike = {
  role?: string;
  parts?: unknown[];
};

/**
 * Resolve a delayed reference such as "use the images I pasted" against the
 * complete image set in the newest user message that contains owned images.
 */
export function findLatestOwnedChatImages(
  messages: ChatMessageLike[],
  userId: string,
): ChatImageReference[] {
  for (
    let messageIndex = messages.length - 1;
    messageIndex >= 0;
    messageIndex--
  ) {
    const message = messages[messageIndex];
    if (message?.role !== "user" || !Array.isArray(message.parts)) continue;

    const images = message.parts.flatMap((part) => {
      if (!part || typeof part !== "object") return [];
      const candidate = part as {
        type?: unknown;
        url?: unknown;
        mediaType?: unknown;
      };
      return candidate.type === "file" &&
        typeof candidate.url === "string" &&
        typeof candidate.mediaType === "string" &&
        candidate.mediaType.startsWith("image/") &&
        isOwnedChatImageUrl(candidate.url, userId)
        ? [{ url: candidate.url, mediaType: candidate.mediaType }]
        : [];
    });
    if (images.length > 0) return images;
  }
  return [];
}

/** Resolve the newest durable user turn containing owned image or video parts. */
export function findLatestOwnedChatMedia(
  messages: ChatMessageLike[],
  userId: string,
): ChatMediaReference[] {
  for (
    let messageIndex = messages.length - 1;
    messageIndex >= 0;
    messageIndex--
  ) {
    const message = messages[messageIndex];
    if (message?.role !== "user" || !Array.isArray(message.parts)) continue;
    const media = message.parts.flatMap((part) => {
      if (!part || typeof part !== "object") return [];
      const candidate = part as {
        type?: unknown;
        url?: unknown;
        mediaType?: unknown;
        filename?: unknown;
      };
      return candidate.type === "file" &&
        typeof candidate.url === "string" &&
        typeof candidate.mediaType === "string" &&
        isChatAttachmentMediaType(candidate.mediaType) &&
        isOwnedChatAttachmentUrl(candidate.url, userId)
        ? [
            {
              url: candidate.url,
              mediaType: candidate.mediaType,
              ...(typeof candidate.filename === "string"
                ? { title: candidate.filename }
                : {}),
            },
          ]
        : [];
    });
    if (media.length > 0) return media;
  }
  return [];
}

/** Backward-compatible singular lookup for callers that only accept one image. */
export function findLatestOwnedChatImage(
  messages: ChatMessageLike[],
  userId: string,
): ChatImageReference | null {
  return findLatestOwnedChatImages(messages, userId).at(-1) ?? null;
}
