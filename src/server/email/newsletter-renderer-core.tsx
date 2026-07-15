import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

import type { EmailDocumentDraft } from "@/lib/email-document";

type GenericHtmlProps = {
  preview: string;
  heading: string;
  bodyHtml: string;
  buttonText: string | undefined;
  buttonHref: string | undefined;
  companyName: string;
  logoSrc: string | undefined;
  logoDarkSrc: string | undefined;
  footer: "wander";
  marketing: false;
  unsubscribeUrl: "#";
};

type ComposeGenericEmail = (
  template: "generic.html",
  props: GenericHtmlProps,
) => Promise<{ html: string; text: string }>;

// The published package exports a strongly typed registry covering every
// Wander email. Keeping this adapter narrow prevents that entire template map
// from leaking into Growth's tRPC output inference while runtime composition
// still comes from the canonical package.
async function composeGenericEmail(props: GenericHtmlProps) {
  const designSystemEmails = await import(
    "@wandercom/design-system-emails"
  );
  // The package's public registry intentionally exposes Required<> props for
  // cross-template strictness even though the generic component itself has
  // runtime defaults. Keep that large registry type local to this adapter.
  const composeEmail = designSystemEmails.composeEmail as ComposeGenericEmail;
  return composeEmail("generic.html", props);
}

export async function renderDesignSystemNewsletter(input: {
  document: EmailDocumentDraft;
  brandName: string;
  logo?: string | null;
}) {
  const bodyHtml = sanitizeHtml(
    await marked.parse(input.document.bodyMarkdown, { gfm: true }),
    {
      allowedTags: [...sanitizeHtml.defaults.allowedTags, "img"],
      allowedAttributes: {
        a: ["href", "title"],
        img: ["src", "alt", "title", "width", "height"],
      },
      allowedSchemes: ["http", "https", "mailto", "tel"],
      allowedSchemesByTag: { img: ["http", "https"] },
      allowProtocolRelative: false,
    },
  );

  const rendered = await composeGenericEmail({
    preview:
      input.document.preheader || input.document.subject || input.brandName,
    heading: input.document.subject || "Untitled email",
    bodyHtml,
    buttonText: input.document.ctaLabel || undefined,
    buttonHref: input.document.ctaUrl || undefined,
    companyName: input.brandName,
    logoSrc: input.logo || undefined,
    logoDarkSrc: input.logo || undefined,
    // Customer.io owns consent, suppression, and its live unsubscribe footer.
    // Keep the editorial projection neutral so Growth never invents a
    // provider unsubscribe URL in saved preview HTML.
    footer: "wander",
    marketing: false,
    unsubscribeUrl: "#",
  });
  return { ...rendered, bodyHtml };
}
