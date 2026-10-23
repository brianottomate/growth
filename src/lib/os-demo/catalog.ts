import { defineCatalog, type Spec } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

export const topics = [
  "website",
  "marketing",
  "integrations",
  "analytics",
  "unsupported",
] as const;
export type Topic = (typeof topics)[number];
export const requestSchema = z.object({
  question: z.string().trim().min(1).max(600),
  previousQuestion: z.string().max(600).optional(),
  previousTopic: z.enum(topics).optional(),
});
export const topicSchema = z.enum(topics);

export const demos = {
  website: {
    title: "Your brand. Your booking experience.",
    question: "What would my booking website look like?",
    component: "BookingPreview",
    followup: "How do I bring guests back?",
    facts:
      "WanderOS offers branded direct-booking websites with integrated payments, analytics, and search optimization. This lab shows an illustrative booking website, not a generated website for this visitor.",
  },
  marketing: {
    title: "Make the next stay feel inevitable.",
    question: "How do I bring guests back?",
    component: "CampaignPreview",
    followup: "How would I track results?",
    facts:
      "WanderOS offers automated guest lifecycle marketing to encourage repeat bookings. This lab illustrates a post-stay email journey. Its timing, audience counts, and email copy are examples, not promised defaults or live campaign settings.",
  },
  integrations: {
    title: "Keep your PMS. Connect your brand.",
    question: "Does this replace my PMS?",
    component: "IntegrationPreview",
    followup: "What would my booking website look like?",
    facts:
      "WanderOS works alongside a property management system; it does not replace it. Listings, pricing, and availability sync from the PMS. The public OS page names Hostaway, Guesty, Streamline, Escapia, Track, and Rentals United. For other providers and detailed setup requirements, check with the WanderOS team.",
  },
  analytics: {
    title: "See the story behind your bookings.",
    question: "How would I track results?",
    component: "AnalyticsPreview",
    followup: "How do I bring guests back?",
    facts:
      "WanderOS includes built-in analytics for its direct-booking website. This lab illustrates bookings, revenue, and channel reporting using invented sample data. These exact metrics and layout are an experimental preview, not a claim that this dashboard is shipped. The sample figures do not predict your results.",
  },
} as const;
export type DemoTopic = keyof typeof demos;
export const catalog = defineCatalog(schema, {
  components: {
    BookingPreview: {
      props: z.object({}),
      description: "Illustrative branded booking website",
    },
    CampaignPreview: {
      props: z.object({}),
      description: "Illustrative guest lifecycle email journey",
    },
    IntegrationPreview: {
      props: z.object({}),
      description: "PMS to WanderOS integration overview",
    },
    AnalyticsPreview: {
      props: z.object({}),
      description: "Illustrative direct-booking analytics with sample data",
    },
  },
  actions: {},
});
// Only code creates specs. Neither model can supply arbitrary props, URLs, or actions.
export function specForTopic(topic: Topic): Spec | null {
  if (topic === "unsupported") return null;
  return {
    root: "preview",
    elements: {
      preview: { type: demos[topic].component, props: {}, children: [] },
    },
  };
}
export const fallbackAnswer =
  "I can show you booking websites, guest marketing, PMS integrations, and an illustrative analytics view. I don’t have verified information to answer that question. Try one of the examples, or check with the WanderOS team.";
export type DemoEvent =
  | { type: "preview"; topic: Topic; confidence: number; selectionMs: number }
  | {
      type: "answer";
      text: string;
      source: "generated" | "reference";
      totalMs: number;
    }
  | { type: "error"; message: string };
