export const SOCIAL_PREVIEW_MODES = [
  "original",
  "x",
  "linkedin",
  "facebook",
  "instagram",
] as const;

export type SocialPreviewMode = (typeof SOCIAL_PREVIEW_MODES)[number];

export const SOCIAL_PREVIEW_META: Record<
  SocialPreviewMode,
  { label: string; aspectClass: string; cropClass: string }
> = {
  original: {
    label: "Original OG",
    aspectClass: "aspect-[40/21]",
    cropClass: "object-cover object-top",
  },
  x: {
    label: "X large card",
    aspectClass: "aspect-[2/1]",
    cropClass: "object-cover object-center",
  },
  linkedin: {
    label: "LinkedIn",
    aspectClass: "aspect-[1.91/1]",
    cropClass: "object-cover object-center",
  },
  facebook: {
    label: "Facebook",
    aspectClass: "aspect-[1.91/1]",
    cropClass: "object-cover object-center",
  },
  instagram: {
    label: "Instagram square",
    aspectClass: "aspect-square",
    cropClass: "object-cover object-center",
  },
};

export function readSocialPreviewMode(
  value: string | undefined,
): SocialPreviewMode {
  return SOCIAL_PREVIEW_MODES.includes(value as SocialPreviewMode)
    ? (value as SocialPreviewMode)
    : "original";
}
