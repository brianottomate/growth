import type { z } from "zod";
import type { getEmailDraftOutputSchema } from "@/server/ai/capabilities/outputs/email";
import type { ConnectorFixture } from "./fixtures";

type EmailDraft = z.infer<typeof getEmailDraftOutputSchema>;
const propertyImage = (asset: string) =>
  `https://www.winterparkescapes.com/i/width=1200,format=jpeg?src=${encodeURIComponent(`https://assets.wander.com/${asset}/fullres.webp`)}`;

// Public listing details, fixed here so Lab never reads or changes client drafts.
export const previewHomes = [
  {
    name: "Roam River Mansion",
    operated: false,
    city: "Winter Park",
    state: "Colorado",
    sleeps: 18,
    imageUrl: propertyImage("690289496721197648"),
    href: "https://www.winterparkescapes.com/property/659508599432678800/roam-river-home",
    note: "Riverfront with a hot tub, sauna and room for everyone.",
  },
  {
    name: "Preserve Creekside Home 280",
    operated: false,
    city: "Winter Park",
    state: "Colorado",
    sleeps: 12,
    imageUrl: propertyImage("659507632473640736"),
    href: "https://www.winterparkescapes.com/property/659507205879369563/preserve-creekside-home-280",
    note: "Five bedrooms, a private hot tub and mountain views.",
  },
  {
    name: "Braidwood Condo 102",
    operated: false,
    city: "Winter Park",
    state: "Colorado",
    sleeps: 8,
    imageUrl: propertyImage("659510796904041008"),
    href: "https://www.winterparkescapes.com/property/659507793702683709/braidwood-condo-102",
    note: "Game nights and cozy evenings with your favorite people.",
  },
];
export const previewBanner =
  "https://pub-d36f3d5f970e419ca42c69144058e8b8.r2.dev/brand_VLkkgvwXVLrBXANs/media_Pm8a3rYQnHjQPYNj/ski-season-is-almost-here-email-header-banner.jpg";

const draft: EmailDraft = {
  brand: {
    id: "demo-brand",
    name: "Winter Park Escapes · Demo",
    slug: "demo-mountain",
    homeCount: 12,
    sendBlockers: [],
  },
  canDeliver: true,
  preview: { html: "", warnings: [] },
  content: {
    id: "demo-email-content",
    title: "A first look at ski season",
    hook: null,
    ctaText: null,
    pillar: null,
    purpose: "Seasonal newsletter",
    plannedAt: "2026-10-23T16:00:00Z",
    series: { id: "demo-series", name: "The Grand County Dispatch" },
  },
  document: {
    id: "demo-email-document",
    platformPostId: "demo-email",
    subject: "Your Winter Park weekend starts here",
    preheader: "A cozy home, fresh air, and room for everyone.",
    bodyMarkdown: `![Ski season in Winter Park](${previewBanner})

Hi there,

Find your home base for ski days and slow evenings in Grand County. Here are three homes with space to gather, private hot tubs, and mountain views.

<!-- homes -->

Book direct with Winter Park Escapes for local support and more time in the mountains.`,
    digest: {
      schema: "wander-growth.listings-digest.v1",
      sections: [
        {
          heading: "Homes with room to gather",
          layout: "grid",
          showPrices: false,
          properties: previewHomes,
        },
      ],
    },
    ctaLabel: "Explore the homes",
    ctaUrl: "https://www.winterparkescapes.com",
    templateKey: "newsletter",
    handoffTargetRepo: null,
    createdAt: "2026-10-19T14:00:00Z",
    updatedAt: "2026-10-19T14:00:00Z",
    createdBy: null,
  },
  spot: {
    id: "demo-email",
    format: "newsletter.broadcast",
    status: "draft",
    scheduledAt: "2026-10-23T16:00:00Z",
    publishedAt: null,
    media: [{ type: "image", url: previewBanner }],
  },
  messageSends: [],
  url: "/app/newsletters/demo-email",
};
const sample = (
  id: string,
  label: string,
  data: EmailDraft,
): ConnectorFixture => ({
  id,
  label,
  payload: { ok: true, action: "get", data },
});
export const emailFixtures: ConnectorFixture[] = [
  sample("tentative", "Newsletter · tentative date", draft),
  sample("approved", "Approved · delivery not scheduled", {
    ...draft,
    spot: { ...draft.spot, status: "approved" },
  }),
  sample("scheduled", "Broadcast · delivery scheduled", {
    ...draft,
    content: { ...draft.content!, series: null },
    spot: { ...draft.spot, status: "scheduled" },
  }),
  sample("unscheduled", "Draft · no calendar date", {
    ...draft,
    content: { ...draft.content!, plannedAt: null, series: null },
    spot: { ...draft.spot, scheduledAt: null },
  }),
  sample("sent", "Sent email", {
    ...draft,
    spot: {
      ...draft.spot,
      status: "published",
      publishedAt: "2026-10-23T16:00:00Z",
    },
  }),
  sample("empty", "Empty email slot", {
    ...draft,
    document: {
      ...draft.document,
      subject: "",
      preheader: null,
      bodyMarkdown: "",
      ctaLabel: null,
      ctaUrl: null,
    },
    spot: { ...draft.spot, scheduledAt: null, media: [] },
  }),
];
