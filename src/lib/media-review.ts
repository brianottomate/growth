export function candidateImageUrls(urls: string[]): string[] {
  const unique = new Set<string>();
  for (const raw of urls) {
    try {
      const url = new URL(raw);
      if (
        url.protocol !== "https:" ||
        /favicon|sprite|pixel|tracking|logo|icon|avatar|badge|1x1/i.test(
          url.pathname,
        )
      )
        continue;
      url.hash = "";
      unique.add(url.toString());
    } catch {
      /* Ignore malformed scrape fragments. */
    }
  }
  return [...unique].slice(0, 40);
}
