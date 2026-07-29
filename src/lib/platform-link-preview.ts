const LINK_PREVIEW_PLATFORMS = new Set([
  "facebook",
  "linkedin",
  "threads",
  "x",
]);

export function supportsNativeLinkPreview(platform: string): boolean {
  return LINK_PREVIEW_PLATFORMS.has(platform.toLowerCase());
}
