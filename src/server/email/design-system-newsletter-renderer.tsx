import "server-only";

import { marked } from "marked";
import { createRequire } from "node:module";
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
};

type DesignSystemEmailModule = {
  composeEmail: (
    template: "generic.html",
    props: GenericHtmlProps,
  ) => Promise<{ html: string; text: string }>;
};

// The published package exports a strongly typed registry covering every
// Wander email. Keeping this adapter narrow prevents that entire template map
// from leaking into Growth's tRPC output inference while runtime composition
// still comes from the canonical package.
const require = createRequire(import.meta.url);
const { composeEmail } =
  require("@wandercom/design-system-emails") as DesignSystemEmailModule;

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

  const rendered = await composeEmail("generic.html", {
    preview:
      input.document.preheader || input.document.subject || input.brandName,
    heading: input.document.subject || "Untitled email",
    bodyHtml,
    buttonText: input.document.ctaLabel || undefined,
    buttonHref: input.document.ctaUrl || undefined,
    companyName: input.brandName,
    logoSrc: input.logo || undefined,
    logoDarkSrc: input.logo || undefined,
  });
  return { ...rendered, bodyHtml };
}
