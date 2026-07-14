import { z } from "zod";

export const EMAIL_DOCUMENT_FORMATS = [
  "newsletter.broadcast",
  "newsletter.blast",
] as const;

export type EmailDocumentFormat = (typeof EMAIL_DOCUMENT_FORMATS)[number];

const optionalUrl = z.string().trim().url().max(2_000).nullable().optional();

export const emailDocumentDraftSchema = z.object({
  subject: z.string().trim().max(200),
  preheader: z.string().trim().max(300).nullable().optional(),
  bodyMarkdown: z.string().max(100_000),
  ctaLabel: z.string().trim().max(100).nullable().optional(),
  ctaUrl: optionalUrl,
  templateKey: z.string().trim().min(1).max(80).default("editorial"),
  handoffTargetRepo: z.string().trim().max(120).nullable().optional(),
});

export type EmailDocumentDraft = z.infer<typeof emailDocumentDraftSchema>;

export type EmailHandoffInput = EmailDocumentDraft & {
  brandName: string;
  brandSlug?: string | null;
  contentTitle: string;
  contentPostId: string;
  platformPostId: string;
  format: EmailDocumentFormat;
  revision: number;
  seriesName?: string | null;
  initiativeName?: string | null;
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
    `revision: ${input.revision}`,
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
  lines.push(`Initiative: ${input.initiativeName || "None"}`);
  lines.push(`Template: ${input.templateKey}`);

  if (assets.length) {
    lines.push("", "## Assets", "");
    for (const asset of assets) {
      lines.push(
        `- ${asset.type}${asset.assetId ? ` (${asset.assetId})` : ""}: ${asset.url}`,
      );
    }
  }

  lines.push(
    "",
    "## Product-runtime responsibilities",
    "",
    "- Resolve recipients and eligibility from the target product's canonical user state.",
    "- Enforce consent and suppression rules in the target product before sending.",
    "- Implement delivery through the target product's Resend Broadcast or Automation runtime.",
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
