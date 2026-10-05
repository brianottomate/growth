import { z } from "zod";

export const brandPageSnapshotSchema = z.object({
  url: z.string().url(),
  markdown: z.string(),
  scrapedAt: z.string(),
});
export type BrandPageSnapshot = z.infer<typeof brandPageSnapshotSchema>;
type PageResult = {
  markdown?: string;
  metadata?: Record<string, unknown>;
} | null;

/** Keep page evidence, not a failed scrape or an error page presented as content. */
export function brandPageSnapshot(
  url: string,
  result: PageResult,
): BrandPageSnapshot | undefined {
  const markdown = result?.markdown?.trim();
  const status = Number(result?.metadata?.statusCode ?? 200);
  const title =
    typeof result?.metadata?.title === "string" ? result.metadata.title : "";
  if (
    !markdown ||
    status >= 400 ||
    /^(404\b|page not found\b|not found\b)/i.test(title)
  )
    return undefined;
  return {
    url: new URL(url).href,
    markdown,
    scrapedAt: new Date().toISOString(),
  };
}

/** Initial enrichment supplies home; About is read on demand for each story. */
export async function loadBrandStoryPages(
  website: string,
  cached: { homepage?: BrandPageSnapshot } | null | undefined,
  scrape: (input: {
    url: string;
    formats: ["markdown"];
  }) => Promise<PageResult>,
) {
  const root = new URL("/", website).href;
  const homepage = async () =>
    cached?.homepage?.url === root && cached.homepage.markdown.trim()
      ? cached.homepage
      : brandPageSnapshot(
          root,
          await scrape({ url: root, formats: ["markdown"] }),
        );
  const about = async () => {
    for (const path of ["/about", "/about-us"]) {
      const url = new URL(path, root).href;
      const page = brandPageSnapshot(
        url,
        await scrape({ url, formats: ["markdown"] }),
      );
      if (page) return page;
    }
    return undefined;
  };
  const pages = await Promise.all([homepage(), about()]);
  return { homepage: pages[0], about: pages[1] };
}
