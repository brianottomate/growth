import type { ToolUIPart, UIMessage } from "ai";
import type { GrowthCapabilityId } from "@/lib/growth-capabilities";

export type Specimen = {
  id: string;
  title: string;
  note: string;
  category: string;
  capability: GrowthCapabilityId;
  action: string;
  data: unknown;
};
export const specimens: Specimen[] = [
  {
    id: "copy-suggestions",
    title: "Selectable ad copy sets",
    note: "Caption and image text stay together; Apply hands the exact card and Story edit to chat. This gallery only shows the handoff message.",
    category: "Ads",
    capability: "presentCopyOptions",
    action: "present",
    data: {
      target: { surface: "ad", brandId: "fixture-coast", adId: "fixture-ad" },
      options: [
        {
          label: "A weekend together",
          rationale: "Lead with the group moment, then show the space.",
          edits: [
            {
              kind: "ad",
              shape: null,
              body: "Bring your favorite people. Spend the weekend together by the coast.",
              headline: "Room for your whole crew",
            },
            {
              kind: "composition",
              cardId: "fixture-slide-2",
              shape: "story",
              title: "A place to gather",
            },
          ],
        },
        {
          label: "A slower morning",
          rationale: "Use a different moment without inventing an amenity.",
          edits: [
            {
              kind: "ad",
              shape: null,
              body: "Coffee, good company, and a slower start. Make the coast your weekend plan.",
              headline: "Take your time",
            },
            {
              kind: "composition",
              cardId: "fixture-slide-2",
              shape: "story",
              title: "Stay a little slower",
            },
          ],
        },
        {
          label: "Make it your base",
          rationale: "Connect the destination with the reason to stay.",
          edits: [
            {
              kind: "ad",
              shape: null,
              body: "Explore the coast, then come home to each other.",
              headline: "Your coastal weekend base",
            },
            {
              kind: "composition",
              cardId: "fixture-slide-2",
              shape: "story",
              title: "Out exploring. Back together.",
            },
          ],
        },
      ],
    },
  },
  {
    id: "workspace",
    title: "Workspace snapshot",
    note: "Counts, attention signals, and the work waiting across a workspace.",
    category: "Workspace",
    capability: "workspaceOverview",
    action: "overview",
    data: {
      brands: 8,
      content: {
        total: 42,
        byStatus: [
          { status: "draft", count: 18 },
          { status: "scheduled", count: 16 },
          { status: "published", count: 8 },
        ],
        needsAttention: 6,
      },
      leads: { domains: 240, contacts: 182, netNew: 31, inInstantly: 96 },
      engageWorthyMentions: 7,
    },
  },
  {
    id: "brands",
    title: "Brand list",
    note: "A compact entry point into the brands in scope.",
    category: "Workspace",
    capability: "brandRead",
    action: "list",
    data: {
      brands: [
        {
          id: "fixture-coast",
          name: "Coastal Retreats",
          tagline: "Room for a slower weekend",
        },
        {
          id: "fixture-alpine",
          name: "Alpine House",
          tagline: "Make the mountains yours",
        },
      ],
    },
  },
  {
    id: "pipeline",
    title: "Content pipeline",
    note: "Idea and standalone channel-post totals stay distinct.",
    category: "Content",
    capability: "contentRead",
    action: "pipeline",
    data: {
      total: 24,
      byStatus: [
        { status: "idea", count: 8 },
        { status: "draft", count: 10 },
        { status: "scheduled", count: 6 },
      ],
      standaloneTotal: 5,
      standaloneByStatus: [{ status: "draft", count: 5 }],
    },
  },
  {
    id: "pipeline-empty",
    title: "Empty pipeline",
    note: "The production card with no content yet.",
    category: "Content",
    capability: "contentRead",
    action: "pipeline",
    data: {
      total: 0,
      byStatus: [],
      standaloneTotal: 0,
      standaloneByStatus: [],
    },
  },
  {
    id: "upcoming",
    title: "Upcoming content",
    note: "Planned ideas and channel posts in one result.",
    category: "Content",
    capability: "contentRead",
    action: "upcoming",
    data: {
      posts: [
        {
          id: "fixture-post",
          title: "A weekend on the coast",
          brandId: "fixture-coast",
          status: "draft",
          pillar: "destinations",
          plannedAt: "2026-10-09T14:00:00Z",
        },
      ],
      standalonePlatformPosts: [
        {
          id: "fixture-channel",
          title: "The view at sunrise",
          brandId: "fixture-coast",
          platform: "instagram",
          status: "scheduled",
          pillar: "homes",
          text: "Wake up somewhere worth remembering.",
          scheduledAt: "2026-10-10T14:00:00Z",
        },
      ],
    },
  },
  {
    id: "production",
    title: "Production queue",
    note: "Next-step buttons hand work back to the assistant.",
    category: "Content",
    capability: "contentRead",
    action: "productionQueue",
    data: {
      brand: { id: "fixture-coast", name: "Coastal Retreats" },
      window: { from: "2026-10-01", through: "2026-10-15" },
      items: [
        {
          id: "fixture-post",
          title: "A weekend on the coast",
          plannedAt: "2026-10-09",
          status: "draft",
          completed: 2,
          total: 4,
          readyForReview: false,
          next: {
            id: "copy",
            label: "Write copy",
            detail: "The photos are ready. Shape the caption.",
          },
          platforms: ["instagram", "facebook"],
          url: "/app/content",
        },
      ],
    },
  },
  {
    id: "structure",
    title: "Series saved",
    note: "A concise receipt after organizing related ideas.",
    category: "Content",
    capability: "contentStrategyWrite",
    action: "saveSeries",
    data: {
      action: "saved",
      change: "series",
      series: { name: "Slow weekends", pillar: "destinations" },
      contentIdeas: 4,
      channelPosts: 8,
      url: "/app/content",
    },
  },
  {
    id: "media",
    title: "Media suggestions",
    note: "Library choices and archive recovery share a result. Buttons only update this gallery.",
    category: "Media",
    capability: "contentRead",
    action: "suggestMedia",
    data: {
      content: {
        id: "fixture-post",
        title: "A weekend on the coast",
        platformDrafts: [],
      },
      library: [
        {
          mediaAssetId: "fixture-media",
          kind: "image",
          title: "Sunrise from the balcony",
          alt: "A quiet ocean view",
          tags: ["coast", "sunrise"],
          url: null,
          thumbnailUrl: null,
          alreadyAttached: false,
        },
        {
          mediaAssetId: "fixture-attached",
          kind: "image",
          title: "Living room",
          alt: "A room facing the water",
          tags: ["interior"],
          url: null,
          thumbnailUrl: null,
          alreadyAttached: true,
        },
      ],
      libraryAssetsWithoutSemanticMetadata: 3,
      archive: [
        {
          platformPostId: "fixture-archive",
          platform: "instagram",
          text: "Last season’s coastal favorite",
          publishedAt: "2026-09-01T14:00:00Z",
          media: [{ mediaIndex: 0, type: "image", previewAvailable: false }],
        },
      ],
    },
  },
  {
    id: "research",
    title: "Research sources",
    note: "Evidence retains its original source link.",
    category: "Research",
    capability: "researchRead",
    action: "search",
    data: {
      query: "What makes a coastal weekend appealing?",
      results: [
        {
          title: "A guide to the coast",
          url: "https://www.wander.com",
          highlights: ["Space to gather, outdoor time, and an easy arrival."],
          publishedDate: "2026-09-20",
        },
      ],
    },
  },
  {
    id: "page",
    title: "Read source",
    note: "A longer extract remains available inside the source card.",
    category: "Research",
    capability: "researchRead",
    action: "readPage",
    data: {
      title: "Coastal weekend guide",
      url: "https://www.wander.com",
      text: "Plan around a relaxed arrival, one good meal, and time outdoors. Give guests practical details alongside the inspiration.",
      provider: "firecrawl",
    },
  },
  {
    id: "leads",
    title: "Lead summary",
    note: "Discovery, enrichment, and handoff counts.",
    category: "People",
    capability: "leadsRead",
    action: "summary",
    data: {
      domains: 240,
      inHubspot: 180,
      inInstantly: 96,
      ranked: 122,
      sendBatch: 18,
      withPreviewUrl: 60,
      untouched: 31,
      contacts: 182,
      netNew: 31,
      topPms: [
        { pms: "Guesty", count: 84 },
        { pms: "Hostaway", count: 48 },
      ],
    },
  },
  {
    id: "mentions",
    title: "Listening signals",
    note: "Relevant conversations with context and a suggested action.",
    category: "People",
    capability: "listeningRead",
    action: "recent",
    data: {
      count: 1,
      mentions: [
        {
          id: "fixture-mention",
          title: "Looking for a family weekend by the water",
          source: "reddit",
          subreddit: "travel",
          author: "sample-traveler",
          url: null,
          keyword: "coastal weekend",
          relevance: 0.92,
          intentTag: "recommendation",
          suggestedAction: "Offer helpful destination context",
          status: "new",
          receivedAt: "2026-10-01T12:00:00Z",
        },
      ],
    },
  },
  {
    id: "product",
    title: "Product result",
    note: "Structured records get a readable product card.",
    category: "Workspace",
    capability: "productAtlasRead",
    action: "get",
    data: {
      id: "fixture-product",
      name: "Weekend discovery",
      description: "Help guests find their next coastal stay.",
      lifecycleStatus: "active",
      atlas: {
        jobs: [],
        journeys: [],
        stories: [],
        surfaces: [],
        views: [],
        storyViewLinks: [],
        implementationRefs: [],
        observations: [],
      },
      storefronts: [],
    },
  },
  {
    id: "saved",
    title: "Write receipt",
    note: "Actions without a specialized card retain an inspectable result.",
    category: "Receipts",
    capability: "brandWrite",
    action: "update",
    data: {
      saved: true,
      name: "Coastal Retreats",
      updatedFields: ["tagline", "description"],
    },
  },
  {
    id: "evidence",
    title: "Applied evidence",
    note: "Expand to inspect saved values and their provenance.",
    category: "Receipts",
    capability: "performanceWrite",
    action: "applyIntake",
    data: {
      evidence: [
        {
          sourceType: "operator",
          sourceId: "fixture-intake",
          sourceUrl: null,
          observedAt: "2026-10-01T12:00:00Z",
          method: "operator-override",
        },
      ],
      applied: [
        {
          targetType: "brand",
          targetId: "fixture-coast",
          field: "tagline",
          value: "Room for a slower weekend",
        },
        {
          targetType: "account",
          targetId: "fixture-account",
          field: "monthlyBudget",
          value: 2500,
        },
      ],
    },
  },
];
specimens.push(
  {
    id: "audiences",
    title: "Brand personas",
    note: "The current persona tool retains an inspectable structured result.",
    category: "People",
    capability: "personaRead",
    action: "list",
    data: [
      {
        id: "fixture-persona",
        brandId: "fixture-coast",
        name: "Families planning a coastal break",
        description: "Parents looking for space to gather and an easy arrival.",
        ageRanges: ["30-55"],
        geographies: ["United States"],
        demandGeography: null,
        notes: "Keep arrival details practical.",
        deletedAt: null,
        createdAt: "2026-10-01T12:00:00Z",
        updatedAt: "2026-10-01T12:00:00Z",
      },
    ],
  },
  {
    id: "strategy",
    title: "Pillars and series",
    note: "The content structure the assistant uses to organize ideas.",
    category: "Content",
    capability: "contentStrategyRead",
    action: "get",
    data: {
      brand: { id: "fixture-coast", name: "Coastal Retreats" },
      pillars: [
        {
          slug: "destinations",
          name: "Destinations",
          description: "Inspiration with practical travel context.",
          color: "var(--color-muted-foreground)",
          source: "custom",
          contentCount: 8,
          targetPct: 40,
          targetPeriod: "month",
        },
      ],
      series: [
        {
          id: "fixture-series",
          name: "Slow weekends",
          description: "One coastal escape each week.",
          theme: "Weekend discovery",
          pillarSlug: "destinations",
          status: "active",
          startAt: null,
          endAt: null,
          content: [
            {
              id: "fixture-post",
              title: "A weekend on the coast",
              pillar: "destinations",
              status: "draft",
            },
          ],
        },
      ],
      groupingProposals: [],
      reviewUrl: "/app/content",
      pillarsUrl: "/app/pillars",
    },
  },
  {
    id: "ads",
    title: "Ad performance snapshot",
    note: "Spend, clicks, conversion totals, and campaign breakdowns.",
    category: "Ads",
    capability: "adsRead",
    action: "scope",
    data: {
      brand: {
        id: "fixture-coast",
        slug: "fixture-coast",
        name: "Coastal Retreats",
      },
      window: { fromDate: "2026-09-01", toDate: "2026-09-30" },
      account: { name: "Coastal demo account" },
      totals: {
        ads: 8,
        allAds: 10,
        impressions: 48000,
        clicks: 720,
        ctr: 0.015,
        spend: 850,
        engagement: 1400,
        conversions: 12,
      },
      byMonth: [
        {
          month: "2026-09",
          ads: 8,
          impressions: 48000,
          clicks: 720,
          spend: 850,
        },
      ],
      byObjective: [],
      byDestination: [],
      flags: { hasAuditAds: false, hasOsAds: false },
    },
  },
  {
    id: "idea-created",
    title: "Idea created",
    note: "A saved idea keeps its title and destination close to the receipt.",
    category: "Receipts",
    capability: "contentWrite",
    action: "createIdea",
    data: {
      id: "fixture-post",
      title: "A weekend on the coast",
      brandName: "Coastal Retreats",
      platforms: ["instagram", "facebook"],
      url: "/app/content",
    },
  },
  {
    id: "audience-saved",
    title: "Persona saved",
    note: "The receipt shows what the assistant saved and where to inspect it.",
    category: "Receipts",
    capability: "personaWrite",
    action: "create",
    data: {
      id: "fixture-persona",
      brandId: "fixture-coast",
      name: "Families planning a coastal break",
      description: "Parents looking for space to gather and an easy arrival.",
      ageRanges: ["30-55"],
      geographies: ["United States"],
      demandGeography: null,
      notes: "Keep arrival details practical.",
      deletedAt: null,
      createdAt: "2026-10-01T12:00:00Z",
      updatedAt: "2026-10-01T12:00:00Z",
    },
  },
  {
    id: "storefront",
    title: "Storefront result",
    note: "An inspectable record for a site the team manages.",
    category: "Workspace",
    capability: "storefrontRead",
    action: "get",
    data: {
      id: "fixture-storefront",
      productId: "fixture-product",
      surface: "chatgpt_connector",
      listingStatus: "live",
      freshnessStatus: "up_to_date",
      content: {
        positioning: {
          audience: "Guests planning a coastal weekend",
          valueProposition: "Find your next stay",
          category: "Travel",
          keyMessages: [],
        },
        copy: {
          displayName: "Coastal Retreats",
          shortDescription: "Find your next coastal stay",
        },
      },
    },
  },
);

export function resultPart(specimen: Specimen): ToolUIPart {
  return {
    type: `tool-${specimen.capability}`,
    toolCallId: `fixture-${specimen.id}`,
    state: "output-available",
    input: { action: specimen.action },
    output: { ok: true, action: specimen.action, data: specimen.data },
  };
}
export const nextMessages: UIMessage[] = [
  {
    id: "fixture-next",
    role: "assistant",
    parts: [
      {
        type: "tool-presentNextOptions",
        toolCallId: "fixture-options",
        state: "output-available",
        input: { action: "present" },
        output: {
          ok: true,
          action: "present",
          data: {
            options: [
              {
                kind: "request",
                label: "Plan the next week",
                text: "Plan next week for Coastal Retreats.",
              },
              {
                kind: "detail",
                label: "Add a constraint",
                text: "Keep the plan focused on weekends.",
              },
              {
                kind: "answer",
                label: "Use Instagram",
                text: "Focus on Instagram first.",
              },
            ],
          },
        },
      },
    ],
  },
];
