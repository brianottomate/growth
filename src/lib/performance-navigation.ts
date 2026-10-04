export const PERFORMANCE_CLIENT_TABS = [
  "overview",
  "setup",
  "booking",
  "catalog",
  "campaigns",
  "newsletters",
  "settings",
  "ads",
  "pitch",
] as const;
export const PERFORMANCE_CLIENT_TAB_LABELS = {
  overview: "Overview",
  setup: "Setup",
  booking: "Homes & targets",
  catalog: "Catalog",
  campaigns: "Campaigns",
  newsletters: "Email",
  settings: "Settings",
  ads: "Ad studio",
  pitch: "Pitch",
} satisfies Record<(typeof PERFORMANCE_CLIENT_TABS)[number], string>;

export function performanceClientDestination(
  slug: string,
  tab: (typeof PERFORMANCE_CLIENT_TABS)[number],
) {
  const base = `/app/performance/clients/${encodeURIComponent(slug)}`;
  return {
    href: tab === "overview" ? base : `${base}/${tab}`,
    pageLabel: PERFORMANCE_CLIENT_TAB_LABELS[tab],
  };
}
