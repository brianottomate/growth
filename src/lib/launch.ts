import { z } from "zod";

/**
 * A launch is one product moment: what ships, when, and who owes what to make
 * it land. It is deliberately NOT a series (one brand's editorial arc) or a
 * campaign (paid, ad-account bound) — most launch deliverables are never
 * posted to a channel at all, and a single launch spans several brands.
 *
 * Two jsonb documents carry the parts that are only ever edited as a set, in
 * the same spirit as `product.atlas`. Anything the launches list, the Slack
 * nudges, or a join needs stays a real column on the table.
 */

export const launchTiers = [1, 2, 3] as const;
export type LaunchTier = (typeof launchTiers)[number];

export const launchMaturities = ["private_preview", "beta", "ga"] as const;
export type LaunchMaturity = (typeof launchMaturities)[number];

export const launchStatuses = [
  "draft",
  "approved",
  "shipped",
  "retro",
] as const;
export type LaunchStatus = (typeof launchStatuses)[number];

/**
 * The surfaces a launch can land on. These are LAUNCH surfaces (where the
 * story goes), deliberately distinct from Product Atlas `surfaces`, which are
 * product surfaces (web, ios, api). Same word, different axis.
 */
export const launchSurfaces = [
  "changelog",
  "in_app",
  "help_center",
  "email",
  "sales_enablement",
  "blog_or_social",
  "customer_prereads",
] as const;
export type LaunchSurface = (typeof launchSurfaces)[number];

export const launchSurfaceLabels: Record<LaunchSurface, string> = {
  changelog: "Changelog",
  in_app: "In-app",
  help_center: "Help center",
  email: "Email",
  sales_enablement: "Sales enablement",
  blog_or_social: "Blog or social",
  customer_prereads: "Customer pre-reads",
};

export const launchDeliverableStatuses = [
  "not_started",
  "drafting",
  "ready",
  "shipped",
] as const;
export type LaunchDeliverableStatus =
  (typeof launchDeliverableStatuses)[number];

/**
 * Where a deliverable is fulfilled. `id` points at a row in another table
 * (or is a plain URL for `url`), so the resolver is allowed to come back
 * empty — nothing enforces the reference, by design. A one-pager that lives
 * in Drive and a blog post that lives in content_post are the same shape.
 */
export const launchRefSchema = z.object({
  kind: z.enum([
    "content_post",
    "email_document",
    "production_packet",
    "platform_post",
    "url",
  ]),
  id: z.string().trim().min(1).max(500),
  label: z.string().trim().max(240).optional(),
});
export type LaunchRef = z.infer<typeof launchRefSchema>;

export const launchDeliverableSchema = z.object({
  surface: z.enum(launchSurfaces),
  /**
   * Kept as free text ALWAYS, and resolved to a member only when the match is
   * certain. Half the owners on a launch (video editors, designers, agency)
   * are not Growth users and never will be. Same convention the content
   * calendar uses: never guess an id from a name.
   */
  ownerName: z.string().trim().max(160).optional(),
  ownerId: z.string().trim().max(100).optional(),
  readyBy: z.string().date().optional(),
  status: z.enum(launchDeliverableStatuses).default("not_started"),
  ref: launchRefSchema.optional(),
  note: z.string().trim().max(1_000).optional(),
});
export type LaunchDeliverable = z.infer<typeof launchDeliverableSchema>;

export const launchObjectionSchema = z.object({
  question: z.string().trim().min(1).max(500),
  answer: z.string().trim().max(1_000).optional(),
  fieldedBy: z.string().trim().max(160).optional(),
});

export const launchSuccessLayers = ["signal", "adoption", "impact"] as const;

export const launchSuccessSchema = z.object({
  layer: z.enum(launchSuccessLayers),
  metric: z.string().trim().max(240),
  target: z.string().trim().max(160).optional(),
  checkOn: z.string().date().optional(),
});

export const launchBriefSchema = z.object({
  /** 140 characters, benefit first, in the customer's words. */
  oneLine: z.string().trim().max(140).optional(),
  /** Three supporting points, no more, each one provable. */
  claims: z.array(z.string().trim().max(500)).max(3).default([]),
  /** True things deliberately left out of the story. */
  notSaying: z.string().trim().max(2_000).optional(),
  /**
   * Written at kickoff, not at ship. If this is hard to write, the scope is
   * wrong — which is the whole point of demanding it early.
   */
  changelogEntry: z.string().trim().max(2_000).optional(),
  audience: z
    .object({
      who: z.string().trim().max(500).optional(),
      excluded: z.string().trim().max(500).optional(),
      motion: z.enum(["plg", "slg"]).optional(),
    })
    .optional(),
  objections: z.array(launchObjectionSchema).max(10).default([]),
  success: z.array(launchSuccessSchema).max(6).default([]),
  /** Atlas node ids this launch ships. Empty => the product itself launches. */
  atlas: z
    .object({
      storyIds: z.array(z.string().trim().min(1)).default([]),
      viewIds: z.array(z.string().trim().min(1)).default([]),
    })
    .optional(),
});
export type LaunchBrief = z.infer<typeof launchBriefSchema>;

export const emptyLaunchBrief: LaunchBrief = {
  claims: [],
  objections: [],
  success: [],
};

/** Tier drives how much support a launch gets, and how early it has to start. */
export const launchTierGuidance: Record<
  LaunchTier,
  { label: string; leadTime: string; surfaces: LaunchSurface[] }
> = {
  1: {
    label: "Tier 1 — full campaign",
    leadTime: "6 weeks",
    surfaces: [...launchSurfaces],
  },
  2: {
    label: "Tier 2 — email, enablement, social",
    leadTime: "2 weeks",
    surfaces: ["changelog", "email", "sales_enablement", "blog_or_social"],
  },
  3: {
    label: "Tier 3 — changelog and email",
    leadTime: "1 week",
    surfaces: ["changelog", "email"],
  },
};
