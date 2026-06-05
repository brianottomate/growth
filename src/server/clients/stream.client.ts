import { env } from "@/env";

// Cloudflare Stream API. We use "Direct Creator Upload": the server requests a
// one-time upload URL + video uid, the browser POSTs the file straight to that
// URL, and Stream transcodes async (HLS + thumbnails + player). Completion is
// reported via webhook (see /api/webhooks/stream) with a poll fallback.

const API_BASE = "https://api.cloudflare.com/client/v4";

function authHeaders(): HeadersInit {
  if (!env.CLOUDFLARE_STREAM_TOKEN) {
    throw new Error("CLOUDFLARE_STREAM_TOKEN is not configured");
  }
  return { Authorization: `Bearer ${env.CLOUDFLARE_STREAM_TOKEN}` };
}

function accountId(): string {
  if (!env.CLOUDFLARE_ACCOUNT_ID) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID is not configured");
  }
  return env.CLOUDFLARE_ACCOUNT_ID;
}

interface CfResponse<T> {
  success: boolean;
  errors: { code: number; message: string }[];
  result: T;
}

async function cf<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init?.headers ?? {}) },
  });
  const json = (await res.json()) as CfResponse<T>;
  if (!res.ok || !json.success) {
    const msg = json.errors?.map((e) => e.message).join("; ") || res.statusText;
    throw new Error(`Cloudflare Stream error: ${msg}`);
  }
  return json.result;
}

export interface StreamDirectUpload {
  uploadURL: string;
  uid: string;
}

/** Request a one-time direct-creator-upload URL. */
export async function streamCreateDirectUpload(opts: {
  maxDurationSeconds?: number;
  creator?: string;
  name?: string;
}): Promise<StreamDirectUpload> {
  return cf<StreamDirectUpload>(`/accounts/${accountId()}/stream/direct_upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      maxDurationSeconds: opts.maxDurationSeconds ?? 3600,
      creator: opts.creator,
      meta: opts.name ? { name: opts.name } : undefined,
      requireSignedURLs: false,
    }),
  });
}

export interface StreamVideo {
  uid: string;
  readyToStream: boolean;
  status: { state: string; pctComplete?: string };
  thumbnail: string;
  duration: number;
  input: { width: number; height: number };
  meta: Record<string, string>;
  playback: { hls: string; dash: string };
}

/** Fetch a video's current state (poll fallback when webhooks lag). */
export async function streamGetVideo(uid: string): Promise<StreamVideo> {
  return cf<StreamVideo>(`/accounts/${accountId()}/stream/${uid}`);
}

export async function streamDeleteVideo(uid: string): Promise<void> {
  await cf(`/accounts/${accountId()}/stream/${uid}`, { method: "DELETE" });
}

/** Customer-subdomain-derived URLs (built client- or server-side from the uid). */
export function streamThumbnailUrl(uid: string): string | null {
  if (!env.NEXT_PUBLIC_STREAM_SUBDOMAIN) return null;
  return `https://${env.NEXT_PUBLIC_STREAM_SUBDOMAIN}.cloudflarestream.com/${uid}/thumbnails/thumbnail.jpg`;
}

export function streamHlsUrl(uid: string): string | null {
  if (!env.NEXT_PUBLIC_STREAM_SUBDOMAIN) return null;
  return `https://${env.NEXT_PUBLIC_STREAM_SUBDOMAIN}.cloudflarestream.com/${uid}/manifest/video.m3u8`;
}

export function streamIframeUrl(uid: string): string | null {
  if (!env.NEXT_PUBLIC_STREAM_SUBDOMAIN) return null;
  return `https://${env.NEXT_PUBLIC_STREAM_SUBDOMAIN}.cloudflarestream.com/${uid}/iframe`;
}

export const Stream = {
  createDirectUpload: streamCreateDirectUpload,
  getVideo: streamGetVideo,
  deleteVideo: streamDeleteVideo,
  thumbnailUrl: streamThumbnailUrl,
  hlsUrl: streamHlsUrl,
  iframeUrl: streamIframeUrl,
} as const;
