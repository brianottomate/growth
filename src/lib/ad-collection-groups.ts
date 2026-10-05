import type { AdContent } from "@/server/db/schema";

export type AdGrouping = "home" | "type";
export type AdHomeContext = {
  id: string;
  name: string;
  externalId: string;
  heroSourceUrl?: string | null;
};
type CollectionAd = {
  id: string;
  homeId: string | null;
  home: { name: string; externalId: string } | null;
  content: AdContent;
};

export function adTypeLabel(ad: CollectionAd) {
  if (!("media" in ad.content)) return "Text";
  const format =
    ad.content.format ?? (ad.content.media.length > 1 ? "carousel" : "static");
  return {
    static: "Static image",
    carousel: "Carousel",
    video: "Video",
    portfolio: "Portfolio",
    catalog: "Catalog",
    text: "Text",
  }[format];
}

/** Explicit home ownership wins over source-photo references. Legacy names remain labelled references. */
export function adHomeContext(ad: CollectionAd, homes: AdHomeContext[] = []) {
  const bound = homes.find((home) => home.id === ad.homeId);
  if (ad.homeId || ad.home)
    return {
      key: `home:${ad.homeId ?? ad.home!.externalId}`,
      label: ad.home?.name ?? bound?.name ?? "Home unavailable",
      anchor: ad.home?.externalId ?? bound?.externalId ?? ad.homeId!,
      photo: bound?.heroSourceUrl ?? null,
    };
  const refs =
    "media" in ad.content
      ? [
          ...new Set(
            ad.content.ideaStudio?.document.cards.flatMap((card) =>
              card.source?.homeId ? [card.source.homeId] : [],
            ) ?? [],
          ),
        ]
      : [];
  if (refs.length > 1)
    return {
      key: "multiple",
      label: "Multiple homes",
      anchor: "multiple",
      photo: null,
    };
  if (refs.length === 1) {
    const home = homes.find((item) => item.id === refs[0]);
    return {
      key: `home:${refs[0]}`,
      label: home?.name ?? "Home unavailable",
      anchor: home?.externalId ?? refs[0]!,
      photo: home?.heroSourceUrl ?? null,
    };
  }
  const name = "media" in ad.content ? ad.content.propertyName?.trim() : null;
  if (name)
    return {
      key: `name:${name.toLowerCase()}`,
      label: `${name} · name reference`,
      anchor: `name:${name}`,
      photo: null,
    };
  return {
    key: "brand",
    label: "No home linked",
    anchor: "brand",
    photo: null,
  };
}

/** Partition once, so multi-home ads never duplicate counts or selections. */
export function groupCollectionAds<T extends CollectionAd>(
  ads: T[],
  grouping: AdGrouping,
  homes: AdHomeContext[] = [],
) {
  const groups = new Map<
    string,
    {
      key: string;
      label: string;
      anchor: string;
      photo: string | null;
      ads: T[];
    }
  >();
  for (const ad of ads) {
    const context =
      grouping === "home"
        ? adHomeContext(ad, homes)
        : {
            key: `type:${adTypeLabel(ad)}`,
            label: adTypeLabel(ad),
            anchor: `type:${adTypeLabel(ad)}`,
            photo: null,
          };
    const group = groups.get(context.key) ?? { ...context, ads: [] };
    group.ads.push(ad);
    groups.set(context.key, group);
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function toggleAdSelection(picked: string[], ids: string[]) {
  const allPicked = ids.every((id) => picked.includes(id));
  return allPicked
    ? picked.filter((id) => !ids.includes(id))
    : [...new Set([...picked, ...ids])];
}
