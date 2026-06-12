/**
 * Content pillars — hard-coded for now (view-only strategy). `content_post.pillar`
 * stores the slug. Promote to a `content_pillar` DB table when we need CRUD /
 * AI-suggested pillars; this registry is the single source of truth until then.
 * Keyed loosely to brand via `brandSlug`.
 */
export type Pillar = {
  slug: string;
  name: string;
  description: string;
  color: string; // oklch, tuned for the dark surface
  brandSlug: string; // which owned brand this pillar belongs to
};

export const PILLARS: Pillar[] = [
  // Wander (consumer travel brand)
  {
    slug: "travel-guides",
    name: "Travel Guides",
    description:
      "Destination guides, neighborhoods, regions, itineraries, trip planning, seasonal travel, local experiences, food & drink, and event-related travel.",
    color: "oklch(0.65 0.16 250)",
    brandSlug: "wander",
  },
  {
    slug: "travel-inspiration",
    name: "Travel Inspiration",
    description:
      "Bucket lists, trip ideas, curated collections, and aspirational travel content.",
    color: "oklch(0.64 0.18 320)",
    brandSlug: "wander",
  },
  {
    slug: "wander-experience",
    name: "The Wander Experience",
    description:
      "Amenities, concierge, wellness, in-home experiences, and what makes Wander unique.",
    color: "oklch(0.72 0.12 190)",
    brandSlug: "wander",
  },
  {
    slug: "customer-stories",
    name: "Customer Stories",
    description:
      "Guest spotlights, trip diaries, repeat traveler stories, and community content.",
    color: "oklch(0.74 0.15 60)",
    brandSlug: "wander",
  },
  {
    slug: "announcements",
    name: "Announcements",
    description:
      "Company news, product launches, partnerships, and new property announcements.",
    color: "oklch(0.68 0.04 280)",
    brandSlug: "wander",
  },
  // Canonical strategy pillars from the team's social content calendar (the
  // source of truth going forward). Colors mirror the sheet's legend.
  {
    slug: "timely-travel",
    name: "Timely Travel",
    description:
      "Seasonal demand capture — capture intent at peak planning moments.",
    color: "oklch(0.72 0.14 150)", // green
    brandSlug: "wander",
  },
  {
    slug: "travel-discovery",
    name: "Travel Discovery",
    description:
      "Utility content — itineraries, guides, destination inspo; drives saves.",
    color: "oklch(0.7 0.13 235)", // blue
    brandSlug: "wander",
  },
  {
    slug: "brand-trust",
    name: "Brand & Trust",
    description:
      "Humanize the brand — founder POV, home approval, customer stories.",
    color: "oklch(0.72 0.03 250)", // neutral
    brandSlug: "wander",
  },
  {
    slug: "entertainment",
    name: "Entertainment",
    description:
      "Top-of-funnel reach — trend-native, POV, humor, aspirational B-roll.",
    color: "oklch(0.76 0.13 65)", // orange
    brandSlug: "wander",
  },
  {
    slug: "insider-community",
    name: "Insider Community",
    description:
      "Loyalty & conversion — polls, ManyChat triggers, early access.",
    color: "oklch(0.66 0.16 300)", // purple
    brandSlug: "wander",
  },
  // WanderOS (operator / host hub)
  {
    slug: "for-hosts",
    name: "For Hosts",
    description:
      "Owner and property-management content, revenue insights, case studies, and operational resources.",
    color: "oklch(0.68 0.15 150)",
    brandSlug: "wanderos",
  },
  {
    slug: "wanderos",
    name: "WanderOS / Property Management",
    description:
      "WanderOS updates, industry insights, and property-manager success stories.",
    color: "oklch(0.62 0.16 270)",
    brandSlug: "wanderos",
  },
];

export const PILLAR_BY_SLUG: Record<string, Pillar> = Object.fromEntries(
  PILLARS.map((p) => [p.slug, p]),
);
