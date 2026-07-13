import type { WebPageType } from "@/server/db/website-schema";

export const WEBSITE_AUDIT_ISSUES = [
  "fetch_error",
  "missing_title",
  "missing_description",
  "missing_og_title",
  "missing_og_description",
  "missing_og_image",
  "missing_twitter_card",
  "missing_canonical",
  "title_mismatch",
  "description_mismatch",
  "twitter_title_mismatch",
  "twitter_description_mismatch",
  "title_too_long",
  "description_too_long",
  "unexpected_og_dimensions",
  "unexpected_twitter_card",
] as const;

export type WebsiteAuditIssue = (typeof WEBSITE_AUDIT_ISSUES)[number];

export type WebsiteAuditEntry = {
  url: string;
  path: string;
  pageType: WebPageType;
  group: string;
  title: string | null;
  description: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  ogImageWidth: string | null;
  ogImageHeight: string | null;
  twitterCard: string | null;
  twitterTitle: string | null;
  twitterDescription: string | null;
  twitterImage: string | null;
  canonical: string | null;
  fetchError: string | null;
  complete: boolean;
  issues: WebsiteAuditIssue[];
};

export type WebsiteAuditResult = {
  website: string;
  sitemapUrl: string;
  auditedAt: string;
  totalDiscovered: number;
  audited: number;
  truncated: boolean;
  summary: {
    complete: number;
    withIssues: number;
    fetchErrors: number;
    missingTitle: number;
    missingDescription: number;
    missingOgImage: number;
    metadataMismatches: number;
  };
  entries: WebsiteAuditEntry[];
};

export const WEBSITE_AUDIT_ISSUE_LABELS: Record<WebsiteAuditIssue, string> = {
  fetch_error: "Fetch error",
  missing_title: "Missing title",
  missing_description: "Missing description",
  missing_og_title: "Missing OG title",
  missing_og_description: "Missing OG description",
  missing_og_image: "Missing OG image",
  missing_twitter_card: "Missing Twitter card",
  missing_canonical: "Missing canonical",
  title_mismatch: "Title differs from OG title",
  description_mismatch: "Description differs from OG description",
  twitter_title_mismatch: "Twitter title differs",
  twitter_description_mismatch: "Twitter description differs",
  title_too_long: "Title over 60 characters",
  description_too_long: "Description over 160 characters",
  unexpected_og_dimensions: "OG image is not 1200×630",
  unexpected_twitter_card: "Twitter card is not summary_large_image",
};
