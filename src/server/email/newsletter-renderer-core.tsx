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
  const designSystemEmails = await import("@wandercom/design-system-emails");
  // The package's public registry intentionally exposes Required<> props for
  // cross-template strictness even though the generic component itself has
  // runtime defaults. Keep that large registry type local to this adapter.
  const composeEmail = designSystemEmails.composeEmail as ComposeGenericEmail;
  return composeEmail("generic.html", props);
}

/**
 * Render the property digest as HTML.
 *
 * The digest is a grid of homes, so it cannot go through the markdown body of
 * the generic template. It renders through the same React Email pipeline as
 * every other Wander email, from the structured `digest` payload, with the
 * document's `bodyMarkdown` reused as the intro copy above the grid.
 */
async function renderListingsDigest(input: {
  document: EmailDocumentDraft;
  brandName: string;
  logo?: string | null;
}) {
  const digest = input.document.digest;
  if (!digest)
    throw new Error("This document has no digest payload to render.");

  const { render } = await import("@react-email/render");
  const { default: ListingsDigest } =
    await import("../../../emails/marketing/ListingsDigest");

  const money = (value: number | null | undefined) =>
    typeof value === "number" ? `$${value.toLocaleString("en-US")}` : null;

  // The template's chrome — value-prop icons, concierge block, help footer,
  // trending strip — is stable per send and lives as CIO-hosted assets in the
  // template's own PreviewProps. Spread it as the baseline and override only
  // what the document actually authors, rather than restating the design here.
  // NOTE: `hero` comes from that baseline too, so it is still the example
  // banner until the digest payload carries its own.
  const element = ListingsDigest({
    ...ListingsDigest.PreviewProps,
    previewText:
      input.document.preheader || input.document.subject || input.brandName,
    greeting: input.document.subject || "",
    // The intro copy stays authored as markdown; the template takes paragraphs.
    paragraphs: input.document.bodyMarkdown
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean),
    sections: digest.sections.map((section) => {
      const [featured, ...more] = section.properties;
      const toCard = (property: (typeof section.properties)[number]) => ({
        location: [property.city, section.heading.split(",").pop()?.trim()]
          .filter(Boolean)
          .join(", "),
        guests: property.sleeps ?? undefined,
        title: property.name,
        priceLabel: [
          money(property.nightlyUsd)
            ? `${money(property.nightlyUsd)}/night`
            : null,
          money(property.perPersonUsd)
            ? `~${money(property.perPersonUsd)}/person`
            : null,
        ]
          .filter(Boolean)
          .join(" · "),
        image: { src: property.imageUrl ?? "", alt: property.name },
        href: property.href ?? "",
      });
      return {
        heading: section.heading,
        featured: toCard(featured!),
        more: more.map(toCard),
        cta: { label: "See all homes", href: "https://www.wander.com" },
      };
    }),
  });

  const html = await render(element);
  const text = await render(element, { plainText: true });
  // The digest has no separate "body" the way the markdown template does: the
  // grid IS the body. Send-time snapshots want the field either way.
  return { html, text, bodyHtml: html };
}

export async function renderDesignSystemNewsletter(input: {
  document: EmailDocumentDraft;
  brandName: string;
  logo?: string | null;
}) {
  // Template dispatch: the digest is structured data, everything else is
  // markdown through the generic template.
  if (input.document.digest) return renderListingsDigest(input);

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
