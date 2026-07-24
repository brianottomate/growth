import type { PlatformFormat } from "@/server/content/formats";

const SUPPORTED_IMAGE_EXTENSIONS = [
  ".avif",
  ".gif",
  ".jpeg",
  ".jpg",
  ".png",
  ".webp",
] as const;

export type CarouselSlideDimensions = {
  width: number;
  height: number;
};

export function isSupportedCarouselImagePath(path: string) {
  const normalized = path.toLowerCase();
  return (
    !normalized.includes("/__macosx/") &&
    !normalized
      .split("/")
      .some((segment) => segment.startsWith(".") && segment !== "..") &&
    SUPPORTED_IMAGE_EXTENSIONS.some((extension) =>
      normalized.endsWith(extension),
    )
  );
}

export function sortCarouselPaths<T>(items: T[], pathFor: (item: T) => string) {
  return [...items].sort((a, b) =>
    pathFor(a).localeCompare(pathFor(b), undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );
}

function parseAspectRatio(value: string) {
  const [width, height] = value.split(":").map(Number);
  return width && height ? width / height : null;
}

function matchesAspectRatio(slide: CarouselSlideDimensions, allowed: string[]) {
  if (!slide.width || !slide.height || !allowed.length) return true;
  const actual = slide.width / slide.height;
  return allowed.some((value) => {
    const expected = parseAspectRatio(value);
    return expected !== null && Math.abs(actual - expected) / expected <= 0.04;
  });
}

export function validateCarouselImport(input: {
  format?: PlatformFormat;
  existingCount: number;
  slides: CarouselSlideDimensions[];
}) {
  const minimum = input.format?.media.min ?? 2;
  const maximum = input.format?.media.max ?? 20;
  const allowedAspectRatios = input.format?.media.aspectRatios ?? [];
  const total = input.existingCount + input.slides.length;
  const errors: string[] = [];
  const warnings: string[] = [];

  if (total < minimum) {
    errors.push(
      `Add at least ${minimum - total} more slide${minimum - total === 1 ? "" : "s"}.`,
    );
  }
  if (total > maximum) {
    errors.push(
      `This format allows ${maximum} slides; remove ${total - maximum}.`,
    );
  }

  const mismatched = input.slides.filter(
    (slide) => !matchesAspectRatio(slide, allowedAspectRatios),
  ).length;
  if (mismatched) {
    warnings.push(
      `${mismatched} slide${mismatched === 1 ? "" : "s"} do not match ${allowedAspectRatios.join(" or ")} and may be cropped by the platform.`,
    );
  }

  return {
    errors,
    warnings,
    minimum,
    maximum,
    total,
    valid: errors.length === 0 && input.slides.length > 0,
  };
}
