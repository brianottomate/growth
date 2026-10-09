import type { ConnectorFixture } from "./fixtures";

const image = "https://growth-red.vercel.app/auth-hero.jpg";
const now = "2026-10-05T14:00:00Z";
const media = [{ type: "image", url: image }];
const brand = { id: "demo-brand", name: "Wander · Demo" };
const result = (action: string, data: unknown) => ({ ok: true, action, data });
const sample = (
  id: string,
  label: string,
  action: string,
  data: unknown,
  tool?: string,
): ConnectorFixture => ({
  id,
  label,
  payload: result(action, data),
  ...(tool ? { tool } : {}),
});
const checks = [
  {
    id: "brief",
    label: "Editorial brief",
    detail: "Hook and creative direction are filled in.",
    complete: true,
  },
  {
    id: "media",
    label: "Hero imagery",
    detail: "One image is attached to the work item.",
    complete: true,
  },
  {
    id: "copy",
    label: "Channel copy",
    detail: "Refine the Instagram caption before review.",
    complete: false,
  },
];
const platformPost = {
  id: "demo-post",
  platform: "instagram",
  status: "draft",
  format: "image",
  text: "Slow mornings, wide horizons. Your next weekend starts here.",
  media,
  assetLinks: [],
  archetype: null,
  channel: {
    id: "demo-channel",
    connectionStatus: "connected",
    defaultProvider: "zernio",
    displayName: "Wander · Demo",
    handle: "wander_demo",
  },
  provider: "zernio",
  scheduledAt: null,
  deliveryError: null,
  deliveryExternalId: null,
  deliveryStatus: null,
  deliveryUpdatedAt: null,
  firstComment: "Save this for your next getaway.",
  firstCommentError: null,
  firstCommentStatus: null,
  firstCommentUpdatedAt: null,
  publishSettings: null,
  threadItems: [],
};
const workItem = {
  id: "demo-content",
  brand,
  title: "A slower kind of weekend",
  pillar: "Dream stays",
  plannedAt: now,
  status: "draft",
  series: { id: "demo-series", name: "Weekend rituals" },
  url: "/app/content/demo-content",
  brief: {
    hook: "The best part of getting away? Having nowhere to rush.",
    captionDirection:
      "Warm, unhurried, specific. Lead with a moment rather than an amenity list.",
    visualDirection: "A sunlit morning with room to breathe.",
    ctaText: "Find your next escape",
    ctaKeyword: null,
    kpi: "Saves and qualified visits",
  },
  media,
  platformPosts: [platformPost],
  readiness: {
    checks,
    completed: 2,
    total: 3,
    readyForReview: false,
    next: checks[2],
  },
};
const copy = {
  headline: "Room to slow down",
  body: "Bring your people. Leave the ordinary behind. Discover a weekend worth remembering.",
  callToAction: "LEARN_MORE",
  linkUrl: "https://example.com/stays",
};
const recipe = {
  templateId: "hero-overlay",
  title: "Room to slow down",
  subtitle: "Your next long weekend",
  eyebrow: "WANDER",
  cta: "Find your escape",
  imagePosition: "center",
  showLogo: false,
};
const document = {
  role: "hero_carousel",
  shapes: ["square", "story", "wide"],
  copy,
  copyOverrides: { story: { ...copy, headline: "Your weekend, reimagined" } },
  intendedPlacements: ["instagram-feed", "instagram-story"],
  cards: [
    {
      id: "demo-slide-1",
      mode: "compose",
      source: { url: image, label: "Coastal morning" },
      recipe,
      overrides: { story: { ...recipe, title: "A slower kind of weekend" } },
    },
    {
      id: "demo-slide-2",
      mode: "compose",
      source: { url: image, label: "Space to gather" },
      recipe: { ...recipe, title: "More room for your people" },
      overrides: {},
    },
  ],
};
const ad = {
  id: "demo-ad",
  brandId: brand.id,
  campaignId: "demo-campaign",
  bookingTargetId: null,
  businessKey: null,
  homeId: null,
  name: "A weekend by the water",
  status: "kept",
  readyAt: null,
  readyBy: null,
  approvedAt: null,
  approvedBy: null,
  replacesAdId: null,
  type: "creative",
  platforms: ["instagram"],
  placements: null,
  createdAt: now,
  updatedAt: now,
  content: { ...copy, media, format: "carousel", ideaStudio: { document } },
};
const creative = {
  ad: { id: ad.id, name: ad.name, approved: false, document, updatedAt: now },
  brand: {
    ...brand,
    story: "Beautiful places for time together.",
    voice: null,
  },
  campaignId: ad.campaignId,
  campaignName: "Autumn escapes",
  copyRules:
    "Use concrete moments. Keep the opening line short. Avoid unsupported claims.",
  homes: [],
  images: document.cards.map((card, i) => ({
    cardId: card.id,
    slide: i + 1,
    size: "square",
    source: card.source,
  })),
};
const campaign = {
  campaign: {
    id: "demo-campaign",
    brandId: brand.id,
    name: "Autumn escapes",
    bookingTargetId: null,
    budget: 2500,
    color: null,
    createdAt: now,
    creativePool: media,
    deletedAt: null,
    description: "A welcoming invitation to reconnect somewhere beautiful.",
    endAt: "2026-11-01T14:00:00Z",
    goal: "Qualified booking visits",
    homesRun: null,
    landingUrl: null,
    performanceCycleId: null,
    slug: "autumn-escapes",
    startAt: now,
    status: "active",
    updatedAt: now,
  },
  brand: {
    ...brand,
    logo: null,
    organizationId: "demo-org",
    relationship: "internal",
    slug: "demo-wander",
    website: null,
  },
  ads: [{ ...ad, home: null }],
  audiences: [
    {
      id: "demo-audience",
      name: "Weekend gatherers",
      brandId: brand.id,
      campaignId: "demo-campaign",
      createdAt: now,
      updatedAt: now,
      description: "People planning a shared long weekend.",
      ageMin: 25,
      ageMax: 65,
      geography: { countries: ["US"] },
      excludedKeywords: null,
      keywords: ["Weekend getaway", "Family travel"],
      optimizationGoal: null,
      persona: { id: "demo-persona", name: "The thoughtful planner" },
      personaId: "demo-persona",
      homeIds: null,
      type: "intent",
    },
  ],
  assetLinks: [],
  personas: [],
  platformAudiences: [],
  platformCampaigns: [],
  handoff: {
    brandId: brand.id,
    campaignId: "demo-campaign",
    reviewPath: "/app/campaigns/demo-campaign",
    reviewUrl: "https://example.com/app/campaigns/demo-campaign",
    state: "draft",
    nextAction:
      "Review creative and audience intent before planning platform delivery.",
  },
};
const homeNames = [
  "Coastal morning",
  "Mountain hideaway",
  "Desert sunset",
  "Lakefront gathering",
];
const catalog = {
  reviewPath: "/app/performance/clients/demo-wander/catalog",
  homes: homeNames.map((name, i) => ({
    id: "demo-home-" + i,
    name,
    url: "https://example.com/stays/" + i,
    imageUrl: image,
  })),
  syncedAt: now,
  defaultTemplate: "catalog-place",
  format: "square",
  unwritten: ["demo-home-2"],
  exports: [
    {
      id: "demo-export",
      status: "done",
      createdAt: now,
      error: null,
      completed: 4,
      total: 4,
      label: "Previous approved batch",
    },
  ],
  draft: {
    formats: ["square"],
    primaryFormat: "square",
    cards: homeNames.map((name, i) => ({
      homeId: "demo-home-" + i,
      included: i !== 3,
      imageUrl: image,
      templateId: "catalog-place",
      title: name,
      adHeadline: name,
      adDescription: "A place for time together",
      subtitle: "A place for time together",
      imagePosition: "center",
      showLogo: false,
      approved: i === 0,
      pills: ["Room to gather", "Memorable views"],
    })),
  },
};
const brands = ["Wander", "Coastal collection", "Mountain collection"].map(
  (name, i) => ({
    id: "demo-brand-" + i,
    name: name + " · Demo",
    slug: "demo-brand-" + i,
    logo:
      i === 0
        ? "https://www.wander.com/Wander-Brand-Assets/svg/Logo%20Dark.svg"
        : null,
    type: "company",
    url: "/app/brands/demo-brand-" + i,
    surfaces: {
      blogPosts: 5,
      channels: 3,
      contentIdeas: 18 + i,
      hasStrategyTargets: i !== 2,
      mediaAssets: 42,
      peers: 2,
      pendingReviews: i + 1,
      personas: 3,
      series: 4,
      webPages: 7,
    },
  }),
);
const photos = {
  brandId: brand.id,
  hasSite: true,
  total: 8,
  nextOffset: 4,
  homes: homeNames.map((name, i) => ({
    homeId: "demo-home-" + i,
    listingId: "demo-listing-" + i,
    name,
    url: "https://example.com/stays/" + i,
    imageUrl: image,
    thumbUrl: image,
    place: ["California", "Colorado", "Arizona", "Michigan"][i],
    mediaAssetId: i === 0 ? "demo-media" : null,
    featured: i < 2,
    heroSourceUrl: image,
  })),
};

export const workspaceFixtures: Record<string, ConnectorFixture[]> = {
  workitem: [
    sample("brief", "Editorial brief + draft", "getWorkItem", workItem),
    sample("empty", "Unfilled brief", "getWorkItem", {
      ...workItem,
      title: null,
      media: [],
      platformPosts: [],
      brief: Object.fromEntries(
        Object.keys(workItem.brief).map((key) => [key, null]),
      ),
    }),
  ],
  campaign: [
    sample("campaign", "Creative + audience plan", "openCampaign", campaign),
    sample("empty", "Empty campaign", "openCampaign", {
      ...campaign,
      ads: [],
      audiences: [],
    }),
  ],
  creative: [
    sample(
      "carousel",
      "Carousel + placement variants",
      "ideaContext",
      creative,
    ),
    sample(
      "saved",
      "Saved creative response",
      "saveIdea",
      ad,
      "adsWrite__saveIdea",
    ),
    sample(
      "text",
      "Text-only draft response",
      "draftAd",
      {
        ...ad,
        type: "text",
        content: {
          headlines: ["Your weekend starts here", "Room to gather"],
          descriptions: ["Find an extraordinary place for your next escape."],
        },
      },
      "adsWrite__draftAd",
    ),
  ],
  catalog: [
    sample("batch", "Mixed approval batch", "catalogState", catalog),
    sample("empty", "Empty catalog", "catalogState", {
      ...catalog,
      homes: [],
      unwritten: [],
      exports: [],
      draft: { ...catalog.draft, cards: [] },
    }),
  ],
  brands: [
    sample("map", "Brand workspace coverage", "getMap", {
      brands,
      guidance: "Choose a brand before reviewing content or creative.",
      reviewUrl: "/app/brands",
    }),
    sample(
      "list",
      "Brand list response",
      "list",
      {
        brands: brands.map((b, i) => ({
          id: b.id,
          name: b.name,
          slug: b.slug,
          logo: b.logo,
          tagline: [
            "Exceptional places. Better time together.",
            "Unhurried stays by the water.",
            "Cabins, fresh air, and room to reconnect.",
          ][i],
          relationship: "internal",
        })),
      },
      "brandRead__list",
    ),
    sample("empty", "Empty workspace", "getMap", {
      brands: [],
      guidance: "Create a brand to get started.",
      reviewUrl: "/app/brands",
    }),
  ],
  photos: [
    sample("homes", "Select + paginate homes", "listingPhotos", photos),
    sample("empty", "No connected site", "listingPhotos", {
      ...photos,
      hasSite: false,
      homes: [],
      total: 0,
      nextOffset: null,
    }),
  ],
};
