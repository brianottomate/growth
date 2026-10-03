import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { format } from "oxfmt";
import { resolveBlogPropertyMedia } from "../../src/server/services/blog-workbench/media";
import {
  serializeArticleLayout,
  type ArticleLayout,
} from "../../src/server/services/blog-workbench/layout";
import type { BlogRunRecord } from "../../src/server/services/blog-workbench/run";

const root = path.resolve("fixtures/blog/comparisons/orlando");
const comparison = JSON.parse(
  await readFile(path.join(root, "comparison.json"), "utf8"),
) as Record<string, unknown> & {
  runId: string;
  generatedSlug: string;
  presentationNote?: string;
};
const run = JSON.parse(
  await readFile(path.join(root, "runs", comparison.runId, "run.json"), "utf8"),
) as BlogRunRecord;
const { layout } = JSON.parse(
  await readFile(
    path.join(root, "runs", comparison.runId, "layout.json"),
    "utf8",
  ),
) as { layout: ArticleLayout };
const hrefs = run.stages.grounding.context.properties.map((p) => p.href);
const media = await resolveBlogPropertyMedia(hrefs);
const mediaByHref = Object.fromEntries(
  media.properties.map((p) => [
    p.href,
    {
      image: p.image,
      alt: p.alt,
      rating: p.rating,
      bedrooms: p.bedrooms,
      bathrooms: p.bathrooms,
      location: p.location,
    },
  ]),
);
// Presentation pass: keep the frozen model output and review receipts unchanged.
const links = layout.sections.flatMap((s) =>
  s.blocks.flatMap((b) => (b.kind === "links" ? b.links : [])),
);
const seasons = ["Spring", "Summer", "Fall", "Winter"];
const movedHrefs = new Set<string>();
for (const section of layout.sections) {
  const season = seasons.find((s) => section.heading.startsWith(`${s} (`));
  if (season) {
    const picks = links.filter((l) =>
      l.label.toLowerCase().startsWith(season.toLowerCase()),
    );
    if (picks.length) {
      section.blocks.push({ kind: "links", links: picks });
      picks.forEach((link) => movedHrefs.add(link.href));
    }
  }
}
for (const section of layout.sections) {
  if (section.heading === "Where to Stay by Season (Property Highlights)") {
    section.blocks = section.blocks.flatMap<
      ArticleLayout["sections"][number]["blocks"][number]
    >((block) => {
      if (block.kind !== "links") return [block];
      const remaining = block.links.filter(
        (link) => !movedHrefs.has(link.href),
      );
      return remaining.length ? [{ ...block, links: remaining }] : [];
    });
    if (!section.blocks.some((block) => block.kind === "links"))
      section.before =
        "The home cards above link to the properties recommended for each season. Compare their listing details when choosing your Orlando home base.";
  }
}
let mdx = serializeArticleLayout(run, layout, hrefs, mediaByHref);
const currentFile = path.resolve(
  "content/posts",
  `${comparison.generatedSlug}.mdx`,
);
const current = await readFile(currentFile, "utf8");
const hero = /<ArticleFigure[\s\S]*?\/>/.exec(current)?.[0];
const separator = mdx.indexOf("\n## ");
if (hero && separator >= 0)
  mdx = mdx.slice(0, separator) + `\n${hero}\n` + mdx.slice(separator);
mdx +=
  '\n<CtaCard title="Find your Orlando home base" description="Explore Wander homes in Orlando and compare the spaces that fit your trip." buttonText="Explore Orlando homes" buttonHref="https://www.wander.com/florida/orlando" features={[]} />\n';
async function save(file: string, value: string) {
  const result = await format(file, value, { printWidth: 80 });
  if (result.errors.length) throw new Error(`Formatting failed: ${file}`);
  await writeFile(file, result.code);
}
await save(
  path.join(root, "property-media.json"),
  JSON.stringify(media, null, 2),
);
await save(
  path.join(root, "presentation-layout.json"),
  JSON.stringify(layout, null, 2),
);
await save(currentFile, mdx);
comparison.presentationNote = `Property photos, location, bedroom/bath counts and available ratings captured from the public Wander listing API; ${media.properties.length} exact listing matches, ${media.missing.length} unavailable. Cards moved into seasonal sections after the saved model review; this presentation revision has not been re-evaluated.`;
await save(
  path.join(root, "comparison.json"),
  JSON.stringify(comparison, null, 2),
);
console.log(comparison.presentationNote);
