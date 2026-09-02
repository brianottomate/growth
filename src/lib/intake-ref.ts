/**
 * How to name an intake's brand in a UI or a log line.
 *
 * `brandSlug` is a snapshot taken at submission and `brand.slug` is nullable
 * for reference brands, so the id is the floor: a row always identifies
 * itself, even after a rename or after the brand row is gone. Client-safe on
 * purpose, because the operator panel renders it.
 */
export function intakeBrandRef(intake: {
  brandSlug: string | null;
  brandId: string | null;
}): string {
  return intake.brandSlug ?? intake.brandId ?? "unknown brand";
}
