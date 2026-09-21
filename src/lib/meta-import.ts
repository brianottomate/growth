import { META_PLACEMENTS, type MetaPlacement } from "./meta-placement-plan";
import type { IdeaDocument, IdeaShape } from "./ad-idea-studio";
import { defaultIdeaRecipe } from "./ad-idea-studio";

export const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
export const objects = (v: unknown) => (Array.isArray(v) ? v.map(object) : []);
export const string = (v: unknown) => (typeof v === "string" ? v : "");
export const strings = (v: unknown) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
/** Catalog creatives are templates backed by products, not missing static artwork. */
export function isImportedMetaCatalog(content: {
  metaImport?: { rawCreative: Record<string, unknown> };
}) {
  const raw = content.metaImport?.rawCreative;
  return Boolean(
    raw && (raw.product_set_id || object(raw.object_story_spec).template_data),
  );
}
export function imageShape(width?: number, height?: number): IdeaShape | null {
  if (!width || !height) return null;
  const r = width / height;
  return Math.abs(r - 0.8) < 0.03
    ? "portrait"
    : Math.abs(r - 1) < 0.03
      ? "square"
      : Math.abs(r - 9 / 16) < 0.03
        ? "story"
        : Math.abs(r - 16 / 9) < 0.03
          ? "wide"
          : null;
}
/** Recover source intent without treating an unordered asset pool as a carousel. */
export function inspectMetaCreative(raw: Record<string, unknown>) {
  const feed = object(raw.asset_feed_spec);
  const link = object(object(raw.object_story_spec).link_data);
  const children = objects(link.child_attachments);
  const images = objects(feed.images);
  const rules = objects(feed.asset_customization_rules);
  const carousels = objects(feed.carousels);
  const defaultRule = rules.find(
    (r) => !object(r.customization_spec).publisher_platforms,
  );
  const labelMatches = (asset: Record<string, unknown>, label: unknown) =>
    objects(asset.adlabels).some((l) => l.name === object(label).name);
  const baseCarousel =
    carousels.find((c) => labelMatches(c, defaultRule?.carousel_label)) ??
    carousels[0];
  const carouselVariants = carousels.map((c) => ({
    base: c === baseCarousel,
    hashes: objects(c.child_attachments).map((card) =>
      string(
        images.find((image) => labelMatches(image, card.image_label))?.hash,
      ),
    ),
  }));
  const issues: string[] = [];
  if (object(raw.object_story_spec).video_data || objects(feed.videos).length)
    issues.push("Video source import is not supported yet.");
  const hashes = carouselVariants.length
    ? [...new Set(carouselVariants.flatMap((c) => c.hashes))]
    : children.length
      ? children.map((c) => string(c.image_hash))
      : images.length
        ? images.map((i) => string(i.hash))
        : [string(link.image_hash)];
  if (!hashes.length || hashes.some((h) => !h))
    issues.push("Original image references could not be recovered.");
  if (
    !children.length &&
    !carouselVariants.length &&
    images.length > 1 &&
    feed.optimization_type !== "PLACEMENT"
  )
    issues.push(
      "Dynamic asset selection cannot be converted into a single fixed ad.",
    );
  const labelled = (assets: unknown, label: unknown) => {
    const rows = objects(assets);
    return rows.find((asset) => labelMatches(asset, label)) ?? rows[0];
  };
  if (carousels.length && !baseCarousel)
    issues.push("Default carousel could not be resolved.");
  const copy = {
    headline:
      string(labelled(feed.titles, defaultRule?.title_label)?.text) ||
      string(link.name),
    body:
      string(labelled(feed.bodies, defaultRule?.body_label)?.text) ||
      string(link.message),
    linkUrl:
      string(
        labelled(feed.link_urls, defaultRule?.link_url_label)?.website_url,
      ) || string(link.link),
    callToAction:
      strings(feed.call_to_action_types)[0] ||
      string(object(link.call_to_action).type) ||
      "",
  };
  if (!copy.headline || !copy.body || !copy.linkUrl)
    issues.push("Review missing headline, primary text, or destination.");
  if (/\s/.test(copy.linkUrl))
    issues.push(
      "The live destination contains whitespace or appended text; correct it before reuse.",
    );
  if (
    objects(feed.titles).length > 1 ||
    objects(feed.bodies).length > 1 ||
    objects(feed.link_urls).length > 1
  )
    issues.push(
      "Multiple copy variants retained in source metadata; choose copy before reuse.",
    );
  return {
    copy,
    hashes: hashes.filter(Boolean),
    carousel: children.length > 0 || carouselVariants.length > 0,
    carouselVariants,
    baseHashes:
      carouselVariants.find((c) => c.base)?.hashes ??
      (children.length ? hashes : []),
    images,
    rules,
    issues,
  };
}
export function importedIdea(
  copy: IdeaDocument["copy"],
  sources: {
    hash: string;
    url: string;
    assetId: string;
    width?: number;
    height?: number;
  }[],
  inspected: ReturnType<typeof inspectMetaCreative>,
): IdeaDocument {
  const baseRule = inspected.rules.find(
    (r) => !object(r.customization_spec).publisher_platforms,
  );
  const baseLabel = string(object(baseRule?.image_label).name);
  const baseHash = string(
    inspected.images.find((i) =>
      objects(i.adlabels).some((l) => l.name === baseLabel),
    )?.hash,
  );
  const baseSources = inspected.baseHashes.flatMap(
    (h) => sources.find((s) => s.hash === h) ?? [],
  );
  const first =
    (inspected.carousel
      ? baseSources[0]
      : sources.find((s) => s.hash === baseHash)) ?? sources[0];
  const baseShape = imageShape(first?.width, first?.height) ?? "portrait";
  const byShape = Object.fromEntries(
    sources.flatMap((s) => {
      const shape = imageShape(s.width, s.height);
      return shape ? [[shape, { url: s.url, assetId: s.assetId }]] : [];
    }),
  );
  const cards = (inspected.carousel ? baseSources : first ? [first] : []).map(
    (source, i) => ({
      id: `import-${i}`,
      source: { url: source.url, assetId: source.assetId },
      sourceOverrides: inspected.carousel
        ? Object.fromEntries(
            inspected.carouselVariants.flatMap((variant) => {
              const matched = sources.find((s) => s.hash === variant.hashes[i]);
              const shape = imageShape(matched?.width, matched?.height);
              return matched && shape
                ? [[shape, { url: matched.url, assetId: matched.assetId }]]
                : [];
            }),
          )
        : byShape,
      mode: "supplied" as const,
      recipe: defaultIdeaRecipe(
        inspected.carousel ? "home_carousel" : "hero_static",
      ),
      overrides: {},
    }),
  );
  return {
    role: inspected.carousel ? "home_carousel" : "hero_static",
    intendedPlacements: first
      ? [
          ...new Set<MetaPlacement>([
            "facebook-feed",
            "instagram-feed",
            ...META_PLACEMENTS.filter(
              (p) =>
                p.kind !== "feed" &&
                inspected.rules.some((r) => {
                  const spec = object(r.customization_spec);
                  return (
                    strings(spec.publisher_platforms).includes(p.publisher) &&
                    strings(spec[`${p.publisher}_positions`]).includes(
                      p.position,
                    )
                  );
                }),
            ).map((p) => p.id),
          ]),
        ]
      : [],
    shapes: inspected.carousel
      ? [
          ...new Set([
            baseShape,
            ...cards.flatMap(
              (c) => Object.keys(c.sourceOverrides) as IdeaShape[],
            ),
          ]),
        ]
      : [...new Set([baseShape, ...(Object.keys(byShape) as IdeaShape[])])],
    copy,
    copyOverrides: {},
    cards,
  };
}
