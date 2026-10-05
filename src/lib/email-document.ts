import { z } from "zod";

import { listingsDigestSchema } from "./listings-digest";

export const EMAIL_DOCUMENT_FORMATS = [
  "newsletter.broadcast",
  "newsletter.blast",
] as const;

export type EmailDocumentFormat = (typeof EMAIL_DOCUMENT_FORMATS)[number];

const optionalUrl = z.string().trim().url().max(2_000).nullable().optional();

export const PRODUCT_UPDATE_CATEGORIES = ["new", "improved", "fixed"] as const;
export const PRODUCT_UPDATE_RELEASE_STATUSES = ["merged", "shipped"] as const;

export const productUpdateEvidenceSchema = z
  .object({
    repository: z.string().trim().min(1).max(200),
    ref: z.string().trim().min(1).max(120),
    url: optionalUrl,
    title: z.string().trim().min(1).max(200),
    summary: z.string().trim().min(1).max(2_000),
    customerImpact: z.string().trim().max(2_000).nullable().optional(),
    category: z.enum(PRODUCT_UPDATE_CATEGORIES),
    releaseStatus: z.enum(PRODUCT_UPDATE_RELEASE_STATUSES),
    mergedAt: z.string().datetime().nullable().optional(),
    shippedAt: z.string().datetime().nullable().optional(),
  })
  .superRefine((evidence, ctx) => {
    if (evidence.releaseStatus === "shipped" && !evidence.shippedAt) {
      ctx.addIssue({
        code: "custom",
        path: ["shippedAt"],
        message: "shippedAt is required for verified shipped evidence",
      });
    }
  });

export const productUpdateContextSchema = z
  .object({
    periodStart: z.string().datetime(),
    periodEnd: z.string().datetime(),
    changes: z.array(productUpdateEvidenceSchema).min(1).max(60),
  })
  .superRefine((context, ctx) => {
    if (Date.parse(context.periodStart) > Date.parse(context.periodEnd)) {
      ctx.addIssue({
        code: "custom",
        path: ["periodEnd"],
        message: "periodEnd must be on or after periodStart",
      });
    }
  });

export type ProductUpdateContext = z.infer<typeof productUpdateContextSchema>;

export const emailDocumentDraftSchema = z.object({
  subject: z.string().trim().max(200),
  preheader: z.string().trim().max(300).nullable().optional(),
  bodyMarkdown: z.string().max(100_000),
  ctaLabel: z.string().trim().max(100).nullable().optional(),
  ctaUrl: optionalUrl,
  templateKey: z.string().trim().min(1).max(80).default("editorial"),
  handoffTargetRepo: z.string().trim().max(120).nullable().optional(),
  productUpdate: productUpdateContextSchema.nullable().optional(),
  /**
   * Structured payload for the property digest, when templateKey says so.
   *
   * Nine homes with locations, guest counts and nightly rates are a table, not
   * prose, so flattening them into bodyMarkdown would throw away the structure
   * the template lays out. `bodyMarkdown` stays the intro copy above the grid.
   */
  digest: listingsDigestSchema.nullable().optional(),
});

export type EmailDocumentDraft = z.infer<typeof emailDocumentDraftSchema>;

export const productUpdateEmailDraftSchema = emailDocumentDraftSchema.extend({
  subject: z.string().trim().min(1).max(200),
  bodyMarkdown: z.string().min(1).max(100_000),
  templateKey: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .default("os.marketing.operator.product-update"),
  productUpdate: productUpdateContextSchema,
});

export type ProductUpdateEmailDraft = z.infer<
  typeof productUpdateEmailDraftSchema
>;

export const productUpdatePreviewProposalSchema = z.object({
  schema: z.literal("wander-growth.product-update-preview.v1"),
  key: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  brandName: z.string().trim().min(1).max(160),
  logo: optionalUrl,
  title: z.string().trim().min(1).max(160),
  purpose: z.string().trim().max(5_000).nullable().optional(),
  hook: z.string().trim().max(2_000).nullable().optional(),
  pillar: z.string().trim().max(120).nullable().optional(),
  plannedAt: z.string().datetime().nullable().optional(),
  draft: productUpdateEmailDraftSchema,
});

export type ProductUpdatePreviewProposal = z.infer<
  typeof productUpdatePreviewProposalSchema
>;

export type EmailHandoffInput = EmailDocumentDraft & {
  brandName: string;
  brandSlug?: string | null;
  contentTitle: string;
  contentPostId: string;
  platformPostId: string;
  format: EmailDocumentFormat;
  seriesName?: string | null;
  campaignName?: string | null;
  plannedAt?: string | null;
  scheduledAt?: string | null;
  purpose?: string | null;
  hook?: string | null;
  ctaIntent?: string | null;
  assetReferences?: Array<{
    assetId?: string;
    url: string;
    type: string;
  }>;
};

const yaml = (value: string | number | null | undefined) =>
  value == null ? "null" : JSON.stringify(value);

/**
 * Portable, deterministic implementation context for a product repository.
 * It intentionally excludes recipients, credentials, and provider tokens.
 */
export function formatEmailImplementationHandoff(
  input: EmailHandoffInput,
): string {
  const assets = input.assetReferences ?? [];
  const lines = [
    "---",
    "schema: wander-growth.email-handoff.v1",
    `targetRepo: ${yaml(input.handoffTargetRepo ?? input.brandSlug ?? null)}`,
    `brand: ${yaml(input.brandName)}`,
    `format: ${yaml(input.format)}`,
    `contentPostId: ${yaml(input.contentPostId)}`,
    `platformPostId: ${yaml(input.platformPostId)}`,
    `plannedAt: ${yaml(input.plannedAt)}`,
    `scheduledAt: ${yaml(input.scheduledAt)}`,
    "---",
    "",
    `# ${input.contentTitle}`,
    "",
    "## Objective",
    "",
    input.purpose?.trim() ||
      input.hook?.trim() ||
      "Implement the approved email artifact below.",
    "",
    "## Approved email",
    "",
    `Subject: ${input.subject || "(not set)"}`,
    `Preheader: ${input.preheader || "(not set)"}`,
    "",
    input.bodyMarkdown.trim() || "(Body not drafted yet.)",
  ];

  if (input.ctaLabel || input.ctaUrl || input.ctaIntent) {
    lines.push(
      "",
      "## Call to action",
      "",
      `Label: ${input.ctaLabel || "(not set)"}`,
      `URL: ${input.ctaUrl || "(not set)"}`,
      `Intent: ${input.ctaIntent || "(not set)"}`,
    );
  }

  lines.push("", "## Planning context", "");
  lines.push(`Series: ${input.seriesName || "None"}`);
  lines.push(`Campaign: ${input.campaignName || "None"}`);
  lines.push(`Template: ${input.templateKey}`);

  if (assets.length) {
    lines.push("", "## Assets", "");
    for (const asset of assets) {
      lines.push(
        `- ${asset.type}${asset.assetId ? ` (${asset.assetId})` : ""}: ${asset.url}`,
      );
    }
  }

  if (input.productUpdate) {
    lines.push(
      "",
      "## Product update evidence",
      "",
      `Evidence window: ${input.productUpdate.periodStart} to ${input.productUpdate.periodEnd}`,
      "",
    );
    for (const change of input.productUpdate.changes) {
      lines.push(
        `- **${change.category.toUpperCase()} · ${change.title}** (${change.repository}@${change.ref})`,
        `  - Release status: ${change.releaseStatus}`,
        `  - Verified summary: ${change.summary}`,
      );
      if (change.customerImpact) {
        lines.push(`  - Customer impact: ${change.customerImpact}`);
      }
      if (change.mergedAt) {
        lines.push(`  - Merged: ${change.mergedAt}`);
      }
      if (change.shippedAt) {
        lines.push(`  - Shipped: ${change.shippedAt}`);
      }
      if (change.url) {
        lines.push(`  - Source: ${change.url}`);
      }
    }
    lines.push(
      "",
      "Every product claim in the approved email must be supported by the evidence above. Omit ambiguous or internal-only changes.",
    );
  }

  lines.push(
    "",
    "## Product-runtime responsibilities",
    "",
    "- Resolve recipients and eligibility from the target product's canonical user state.",
    "- Enforce consent and suppression rules in the target product before sending.",
    "- Deliver through Growth's governed Customer.io broadcast workflow.",
    "- Preserve the approved subject, body, links, and tracking parameters unless a product constraint requires a reviewed change.",
    "- Do not copy recipient lists, credentials, or provider secrets into Wander Growth.",
    "",
    "## Acceptance criteria",
    "",
    "- The product implementation matches this frozen Wander Growth revision.",
    "- Links and UTMs are verified in a real test email.",
    "- Consent, eligibility, and unsubscribe behavior remain product-owned.",
    "- Any implementation divergence is recorded before the production send.",
  );

  return `${lines.join("\n")}\n`;
}
