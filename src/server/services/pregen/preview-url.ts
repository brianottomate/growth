import { env } from "@/env";

/**
 * Where a pregen preview lives.
 *
 * One shape, and it is a hostname rather than a path:
 *
 *     https://<label>.<zone>/?t=<previewToken>
 *
 * The renderer (wandercom/pregen-preview) identifies the prospect by the
 * subdomain label and authorizes on the token. For growth-native prospects the
 * label is cosmetic — that renderer resolves growth previews by token alone —
 * so it is the prospect's own domain, which is what makes a forwarded link
 * legible. Monolith prospects are the case where the label carries meaning:
 * there it must be the websiteId, and the monolith builds its own links.
 *
 * Returns null when no zone is configured, so callers surface "not configured"
 * instead of linking somewhere that cannot resolve.
 */
export function pregenPreviewUrl(prospect: {
  domain: string;
  previewToken: string;
}): string | null {
  const zone = env.PREGEN_PREVIEW_HOST_ZONE;
  if (!zone) return null;

  const label = previewHostLabel(prospect.domain);
  return `https://${label}.${zone}/?t=${encodeURIComponent(prospect.previewToken)}`;
}

/**
 * A DNS label from a prospect domain: `www.Cascadia-Getaways.com` →
 * `cascadia-getaways`. Labels need not be unique — the token decides which
 * prospect resolves — but they do have to be a legal hostname label, so
 * anything outside [a-z0-9-] is folded to a hyphen and the result is capped at
 * the 63-character limit.
 */
export function previewHostLabel(domain: string): string {
  const host = domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]!
    .split(".")[0]!;

  const label = host
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    .replace(/-+$/, "");

  return label || "preview";
}
