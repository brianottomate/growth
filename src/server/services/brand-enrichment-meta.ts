export function selectBrandLogo({
  favicon,
  ogImage,
}: {
  favicon?: string;
  ogImage?: string;
}): string | undefined {
  return favicon ?? ogImage;
}
