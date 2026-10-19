import type { z } from "zod";
import type { socialPostPreviewOutputSchema } from "@/server/ai/capabilities/social-post-preview";
import { emailFixtures } from "./email-fixtures";
import { workspaceFixtures } from "./workspace-fixtures";

type SocialResult = z.infer<typeof socialPostPreviewOutputSchema>;
export type ConnectorFixture = {
  id: string;
  label: string;
  payload: unknown;
  tool?: string;
};
const post: SocialResult["data"]["posts"][number] = {
  id: "fixture-coastal",
  platform: "instagram",
  format: "image",
  status: "draft",
  text: "A slow morning by the water. Room to gather, space to unwind, and a view worth waking up for.\n\nWhere would you spend your next long weekend?",
  firstComment: null,
  scheduledAt: "2026-10-09T14:00:00Z",
  publishedAt: null,
  externalUrl: null,
  href: "/app/feed-v5?post=fixture-coastal",
  brand: { name: "Wander · Demo", logo: null },
  channel: { displayName: "Wander · Demo", handle: "wander_demo" },
  media: [
    {
      type: "image",
      url: "https://growth-red.vercel.app/auth-hero.jpg",
      thumbnail: null,
    },
  ],
};
const social = (posts: SocialResult["data"]["posts"]): SocialResult => ({
  ok: true,
  action: "render",
  data: {
    posts: posts.map((post) => ({
      ...post,
      href: `/app/feed-v5?post=${encodeURIComponent(post.id)}`,
    })),
  },
});
export const socialFixtures: ConnectorFixture[] = [
  {
    id: "comparison",
    label: "Instagram + X",
    payload: social([
      post,
      {
        ...post,
        id: "fixture-x",
        platform: "x",
        text: "Your next long weekend, with a little more room to breathe.\nhttps://example.com/coastal-retreat",
        status: "scheduled",
      },
    ]),
  },
  {
    id: "text",
    label: "Text only",
    payload: social([{ ...post, platform: "x", media: [], scheduledAt: null }]),
  },
  {
    id: "long",
    label: "Long copy · six posts",
    payload: social(
      Array.from({ length: 6 }, (_, i) => ({
        ...post,
        id: `fixture-long-${i}`,
        platform: i % 2 ? "x" : "instagram",
        text: `${post.text}\n\n${"A place for unhurried days and shared moments. ".repeat(12)}`,
        status: i % 2 ? "scheduled" : "draft",
      })),
    ),
  },
  {
    id: "missing",
    label: "Unavailable image",
    payload: social([
      {
        ...post,
        media: [
          {
            type: "image",
            url: "https://invalid.example/missing.jpg",
            thumbnail: null,
          },
        ],
      },
    ]),
  },
];
export const optionsFixtures: ConnectorFixture[] = [
  {
    id: "choices",
    label: "Answer, request + editable detail",
    payload: {
      ok: true,
      action: "present",
      data: {
        options: [
          {
            kind: "answer",
            label: "Focus on coastal homes",
            text: "Let's focus on coastal homes.",
          },
          {
            kind: "request",
            label: "Compare the drafts",
            text: "Compare these drafts for Instagram and X.",
          },
          {
            kind: "detail",
            label: "Add creative direction",
            text: "I'd like the campaign to feel relaxed and welcoming. The audience is ",
          },
        ],
      },
    },
  },
  {
    id: "single",
    label: "Single follow-up",
    payload: {
      ok: true,
      action: "present",
      data: {
        options: [
          {
            kind: "request",
            label: "Show the calendar",
            text: "Show me the content calendar for next week.",
          },
        ],
      },
    },
  },
];

socialFixtures.push({
  id: "carousel",
  label: "Carousel + first comment",
  payload: social([
    {
      ...post,
      firstComment: "Save this for your next getaway.",
      media: [
        post.media[0]!,
        { ...post.media[0]!, type: "carousel" },
        post.media[0]!,
      ],
    },
  ]),
});

const calendarData = {
  window: { from: "2026-10-05T05:00:00Z", through: "2026-10-19T05:00:00Z" },
  posts: [
    {
      id: "fixture-morning",
      brandId: "fixture-wander",
      title: "A slower kind of morning",
      status: "scheduled",
      pillar: "Life at Wander",
      plannedAt: "2026-10-07T14:00:00Z",
    },
    {
      id: "fixture-guide",
      brandId: "fixture-wander",
      title: "Your coastal weekend guide",
      status: "pending_review",
      pillar: "Local discoveries",
      plannedAt: "2026-10-07T18:00:00Z",
    },
    {
      id: "fixture-table",
      brandId: "fixture-wander",
      title: "Room for everyone at the table",
      status: "draft",
      pillar: "Gather together",
      plannedAt: "2026-10-09T16:00:00Z",
    },
    {
      id: "fixture-view",
      brandId: "fixture-wander",
      title: "Wake up to a different view",
      status: "approved",
      pillar: "Dream stays",
      plannedAt: "2026-10-12T14:00:00Z",
    },
  ],
  standalonePlatformPosts: [
    {
      id: "fixture-standalone",
      brandId: "fixture-wander",
      title: "The view from here",
      text: "Slow mornings, wide horizons.",
      platform: "instagram",
      status: "scheduled",
      pillar: "Dream stays",
      scheduledAt: "2026-10-08T15:00:00Z",
      metadata: null,
    },
  ],
};
const calendarFixtures: ConnectorFixture[] = [
  {
    id: "week",
    label: "Mixed planning window",
    payload: { ok: true, action: "upcoming", data: calendarData },
  },
  {
    id: "empty",
    label: "Empty calendar",
    payload: {
      ok: true,
      action: "upcoming",
      data: { ...calendarData, posts: [], standalonePlatformPosts: [] },
    },
  },
];
const pipelineFixtures: ConnectorFixture[] = [
  {
    id: "overview",
    label: "Healthy pipeline",
    payload: {
      ok: true,
      action: "pipeline",
      data: {
        total: 86,
        byStatus: [
          { status: "draft", count: 28 },
          { status: "scheduled", count: 21 },
          { status: "published", count: 18 },
          { status: "pending_review", count: 12 },
          { status: "approved", count: 7 },
        ],
        standaloneTotal: 14,
        standaloneByStatus: [
          { status: "draft", count: 5 },
          { status: "scheduled", count: 9 },
        ],
      },
    },
  },
  {
    id: "review",
    label: "Review bottleneck",
    payload: {
      ok: true,
      action: "pipeline",
      data: {
        total: 48,
        byStatus: [
          { status: "pending_review", count: 37 },
          { status: "draft", count: 8 },
          { status: "scheduled", count: 3 },
        ],
        standaloneTotal: 0,
        standaloneByStatus: [],
      },
    },
  },
  {
    id: "empty",
    label: "Empty workspace",
    payload: { ok: true, action: "pipeline", data: { total: 0, byStatus: [] } },
  },
];
const productionData = {
  brand: { id: "fixture-wander", name: "Wander · Demo" },
  window: calendarData.window,
  items: [
    {
      id: "fixture-morning",
      title: "A slower kind of morning",
      status: "draft",
      plannedAt: "2026-10-07T14:00:00Z",
      platforms: ["instagram", "x"],
      completed: 3,
      total: 5,
      readyForReview: false,
      next: {
        id: "copy",
        label: "Refine the opening line",
        detail:
          "The imagery is ready. Give the caption a stronger first sentence.",
        complete: false,
      },
      url: "/app/content/fixture-morning",
    },
    {
      id: "fixture-guide",
      title: "Your coastal weekend guide",
      status: "pending_review",
      plannedAt: "2026-10-09T14:00:00Z",
      platforms: ["instagram"],
      completed: 5,
      total: 5,
      readyForReview: true,
      next: null,
      url: "/app/content/fixture-guide",
    },
    {
      id: "fixture-table",
      title: "Room for everyone at the table",
      status: "draft",
      plannedAt: "2026-10-12T14:00:00Z",
      platforms: ["instagram", "facebook"],
      completed: 1,
      total: 5,
      readyForReview: false,
      next: {
        id: "media",
        label: "Choose the hero image",
        detail: "Find a welcoming dining scene from the creative library.",
        complete: false,
      },
      url: "/app/content/fixture-table",
    },
  ],
};
const productionFixtures: ConnectorFixture[] = [
  {
    id: "queue",
    label: "Progress + next steps",
    payload: { ok: true, action: "productionQueue", data: productionData },
  },
  {
    id: "empty",
    label: "Empty queue",
    payload: {
      ok: true,
      action: "productionQueue",
      data: { ...productionData, items: [] },
    },
  },
];
const performanceData = {
  brand: {
    id: "fixture-wander",
    name: "Wander · Demo",
    slug: "fixture-wander",
  },
  window: { fromDate: "2026-09-21", toDate: "2026-10-05" },
  filters: { limit: 4, metric: "clicks", status: "all" },
  matched: 24,
  ads: [
    {
      id: "fixture-ad-1",
      name: "A weekend by the water",
      body: "A place to gather. A view to remember. Make your next long weekend a Wander weekend.",
      campaign: "Autumn escapes",
      clicks: 1248,
      conversions: 32,
      cpc: 0.84,
      created: "2026-09-20",
      ctr: 2.38,
      destination: "marketplace",
      engagement: 1782,
      impressions: 52436,
      link: null,
      objective: "OUTCOME_SALES",
      spend: 1048.32,
      status: "ACTIVE",
      thumbnailUrl: "https://growth-red.vercel.app/auth-hero.jpg",
    },
    {
      id: "fixture-ad-2",
      name: "More room for your people",
      body: "Bring everyone. Leave the ordinary behind. Discover homes built for time together.",
      campaign: "Gather together",
      clicks: 980,
      conversions: 27,
      cpc: 1.12,
      created: "2026-09-23",
      ctr: 3.14,
      destination: "marketplace",
      engagement: 1103,
      impressions: 31210,
      link: null,
      objective: "OUTCOME_SALES",
      spend: 1097.6,
      status: "ACTIVE",
      thumbnailUrl: "https://growth-red.vercel.app/auth-hero.jpg",
    },
    {
      id: "fixture-ad-3",
      name: "Slow mornings start here",
      body: "Coffee with a view. Nowhere to rush. Your next escape is closer than you think.",
      campaign: "Autumn escapes",
      clicks: 712,
      conversions: 16,
      cpc: 0.92,
      created: "2026-09-25",
      ctr: 1.86,
      destination: "marketplace",
      engagement: 942,
      impressions: 38280,
      link: null,
      objective: "OUTCOME_SALES",
      spend: 655.04,
      status: "PAUSED",
      thumbnailUrl: null,
    },
  ],
};
const performanceFixtures: ConnectorFixture[] = [
  {
    id: "ranked",
    label: "Ranked creative shortlist",
    payload: { ok: true, action: "top", data: performanceData },
  },
  {
    id: "empty",
    label: "No matching ads",
    payload: {
      ok: true,
      action: "top",
      data: { ...performanceData, ads: [], matched: 0 },
    },
  },
];
// All samples are validated against the canonical tool schema by the server page.
export const connectorFixtures: Record<string, ConnectorFixture[]> = {
  ...workspaceFixtures,
  email: emailFixtures,
  social: socialFixtures,
  options: optionsFixtures,
  calendar: calendarFixtures,
  pipeline: pipelineFixtures,
  production: productionFixtures,
  performance: performanceFixtures,
};
