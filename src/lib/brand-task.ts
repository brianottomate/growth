import { z } from "zod";

export const TASK_CATEGORIES = {
  setup: "Setup",
  ads_infrastructure: "Ads infrastructure",
  creative: "Creative",
  marketing: "Marketing",
  billing: "Billing & payments",
} as const;
export type TaskCategory = keyof typeof TASK_CATEGORIES;
export const taskCategorySchema = z.enum([
  "setup",
  "ads_infrastructure",
  "creative",
  "marketing",
  "billing",
]);

export const TASK_STATUSES = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
  not_applicable: "Not applicable",
} as const;
export const taskStatusSchema = z.enum([
  "todo",
  "in_progress",
  "done",
  "not_applicable",
]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

/** Suggestions only: operators can add their own strings. */
export const TASK_TAG_SUGGESTIONS = [
  "meta",
  "google",
  "ad account",
  "pixel",
  "tracking",
  "creative",
  "catalog",
  "ads",
  "copy",
  "landing page",
  "email",
  "reporting",
  "billing",
  "payments",
  "client access",
  "audiences",
] as const;

export const brandTaskFields = z.object({
  title: z.string().trim().min(1).max(300),
  notes: z.string().max(10000).nullable(),
  category: taskCategorySchema,
  tags: z.array(z.string().trim().toLowerCase().min(1).max(50)).max(30),
  status: taskStatusSchema,
  assigneeUserId: z.string().min(1).nullable(),
  dueDate: z.iso.date().nullable(),
});
export type BrandTaskFields = z.infer<typeof brandTaskFields>;

/** Stable keys identify template instances; they never dictate later client edits. */
export const DEFAULT_CLIENT_TASKS: readonly {
  key: string;
  title: string;
  category: TaskCategory;
  tags: string[];
}[] = [
  {
    key: "metaConnected",
    title: "Connect Facebook / Meta",
    category: "ads_infrastructure",
    tags: ["meta", "ad account", "client access"],
  },
  {
    key: "googleAdsAccount",
    title: "Set up Google Ads account",
    category: "ads_infrastructure",
    tags: ["google", "ad account"],
  },
  {
    key: "googleBilling",
    title: "Set up Google billing",
    category: "billing",
    tags: ["google", "billing"],
  },
  {
    key: "catalogCreative",
    title: "Prepare catalog ad creative",
    category: "creative",
    tags: ["catalog", "creative", "ads"],
  },
  {
    key: "carouselCreative",
    title: "Prepare carousel creative",
    category: "creative",
    tags: ["creative", "ads"],
  },
  {
    key: "heroCreative",
    title: "Prepare hero creative",
    category: "creative",
    tags: ["creative", "ads"],
  },
  {
    key: "adCopy",
    title: "Write ad copy",
    category: "creative",
    tags: ["copy", "ads"],
  },
  {
    key: "adsLive",
    title: "Review ads launch",
    category: "setup",
    tags: ["ads"],
  },
  {
    key: "newsletter",
    title: "Plan Wander newsletter",
    category: "marketing",
    tags: ["email"],
  },
  {
    key: "influencer",
    title: "Coordinate influencer marketing",
    category: "marketing",
    tags: [],
  },
  {
    key: "socialPosts",
    title: "Prepare social media posts",
    category: "marketing",
    tags: ["creative", "copy"],
  },
];

export function taskSettled(status: TaskStatus) {
  return status === "done" || status === "not_applicable";
}

/**
 * A choice a task is waiting on, with what the operator needs to make it in
 * one click. The recommendation is advice; nothing is applied until confirmed.
 */
export type BrandTaskDecision = {
  type: "meta_pixel";
  adAccountId: string;
  adAccountName: string | null;
  options: { id: string; name: string; evidence: string[] }[];
  recommendedId: string | null;
  why: string;
  recommendedBy: "evidence" | "model" | null;
};
