import type { z } from "zod";
import type { getEmailDraftOutputSchema } from "@/server/ai/capabilities/outputs/email";
import type { ConnectorFixture } from "./fixtures";

type EmailDraft = z.infer<typeof getEmailDraftOutputSchema>;
const draft: EmailDraft = {
  brand: {
    id: "demo-brand",
    name: "Mountain Escapes · Demo",
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
    series: { id: "demo-series", name: "The Mountain Dispatch" },
  },
  document: {
    id: "demo-email-document",
    platformPostId: "demo-email",
    subject: "Your next mountain morning starts here",
    preheader: "A cozy home, fresh air, and room for everyone.",
    bodyMarkdown:
      "![A quiet cabin in the trees](https://growth-red.vercel.app/auth-hero.jpg)\n\n## Make room for a mountain weekend\n\nSlow mornings by the fireplace. A long weekend with your favorite people. This edition brings together homes made for gathering, with space to settle in and time to explore.\n\n### Stay a little longer\n\nFind a place to reconnect, cook together, and head outside when the mood takes you.",
    ctaLabel: "Explore the homes",
    ctaUrl: "https://www.wander.com",
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
    media: [
      { type: "image", url: "https://growth-red.vercel.app/auth-hero.jpg" },
    ],
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
