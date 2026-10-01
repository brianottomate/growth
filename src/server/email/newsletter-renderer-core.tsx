import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

import type { EmailDocumentDraft } from "@/lib/email-document";
import { type EmailRecipient, fillFields } from "@/lib/email-personalization";
import {
  HOMES_MARKER_PATTERN,
  markerGroupIndex,
  savingsLabel,
} from "@/lib/listings-digest";
import { legalAddressLine } from "@/lib/brand-legal";
import type {
  BrandEmailSender,
  BrandLegalIdentity,
} from "@/server/db/brand-schema";

import type {
  DigestChrome,
  FlowItem,
} from "../../../emails/marketing/ListingsDigest";

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

export type NewsletterRenderInput = {
  document: EmailDocumentDraft;
  brandName: string;
  logo?: string | null;
  /** How the brand's email presents itself; without it, a neutral frame. */
  sender?: BrandEmailSender | null;
  /** Who stands behind the brand; the footer prints its address. */
  legal?: BrandLegalIdentity | null;
  /** The provider's placeholder at send time; "#" in previews. */
  unsubscribeUrl?: string;
  /** Fill per-guest fields for this guest; without it they stay as written. */
  recipient?: EmailRecipient;
  /** Preview only: keep the editor's `data-block` ids on the body's blocks. */
  blockIds?: boolean;
};

/**
 * Wander's listing photos are WebP, which desktop Outlook cannot show. A
 * WanderOS site serves any of them as JPEG through its own image path, so a
 * brand's email asks its own site for them.
 */
function emailSafeImages(html: string, siteUrl: string | null | undefined) {
  if (!siteUrl) return html;
  const origin = new URL(siteUrl).origin;
  return html.replace(
    /https:\/\/assets\.wander\.com\/[^"'\s)]+\.webp/g,
    (url) =>
      `${origin}/i/width=1200,format=jpeg?src=${encodeURIComponent(url)}`,
  );
}

async function markdownHtml(markdown: string, blockIds = false) {
  return sanitizeHtml(await marked.parse(markdown, { gfm: true }), {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, "img"],
    allowedAttributes: {
      a: ["href", "title"],
      img: ["src", "alt", "title", "width", "height", "style"],
      ...(blockIds ? { "*": ["data-block"] } : {}),
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["http", "https"] },
    allowProtocolRelative: false,
    // A photo in the body fills the card, never its own pixel width.
    transformTags: {
      img: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          style:
            "display:block;width:100%;max-width:100%;height:auto;border-radius:12px",
        },
      }),
    },
  });
}

/**
 * The body in reading order: copy, and the home groups its markers place.
 * `blockIds` keeps the preview's `data-block` ids so a click in the preview
 * can find its block; sends never carry them.
 */
async function bodyFlow(
  body: string,
  groupCount: number,
  blockIds: boolean,
): Promise<FlowItem[]> {
  const flow: FlowItem[] = [];
  let last = 0;
  const html = async (segment: string) => {
    if (segment.trim()) {
      flow.push({ kind: "html", html: await markdownHtml(segment, blockIds) });
    }
  };
  for (const match of body.matchAll(HOMES_MARKER_PATTERN)) {
    await html(body.slice(last, match.index));
    const index = markerGroupIndex(match[0]);
    if (index !== null && index < groupCount)
      flow.push({ kind: "group", index });
    last = match.index + match[0].length;
  }
  await html(body.slice(last));
  return flow;
}

/**
 * The frame around every newsletter, from the brand's own sender settings.
 * A brand without them gets its name and logo and nothing else.
 */
function newsletterChrome(input: NewsletterRenderInput): DigestChrome {
  const sender = input.sender;
  // Email clients block data URIs, so a scraped inline logo counts as none.
  const logo = [sender?.logoUrl, input.logo].find(
    (url) => url && !url.startsWith("data:"),
  );
  const contact = sender?.contact;
  const phone = contact?.phone.replace(/[^+\d]/g, "");
  return {
    brandName: input.brandName,
    headerLogoSrc: logo ?? undefined,
    valueProps: sender?.valueProps?.map((prop) => ({
      iconSrc: prop.iconUrl,
      label: prop.label,
    })),
    primaryCta: sender?.siteUrl
      ? {
          label: sender.siteCtaLabel || "Explore our homes",
          href: sender.siteUrl,
        }
      : undefined,
    secondaryCta:
      phone && contact?.textLabel
        ? { label: contact.textLabel, href: `sms:${phone}` }
        : undefined,
    concierge: contact?.note
      ? { note: contact.note, avatarsSrc: contact.imageUrl ?? undefined }
      : undefined,
    help: phone
      ? {
          heading: contact?.heading || "Questions? We're here to help.",
          text:
            contact?.text ||
            `Text or call the ${input.brandName} team and we'll help you find the right home and dates.`,
          avatarsSrc: contact?.imageUrl ?? undefined,
          textCta: {
            label: contact?.textLabel || "Text us",
            href: `sms:${phone}`,
          },
          callCta: {
            label: contact?.callLabel || "Call us",
            href: `tel:${phone}`,
          },
        }
      : undefined,
    footer: {
      logoSrc: logo ?? undefined,
      tagline: sender?.tagline ?? undefined,
      address: legalAddressLine(input.legal) ?? undefined,
      unsubscribeUrl: input.unsubscribeUrl ?? "#",
    },
  };
}

type ComposeGenericEmail = (
  template: "generic.html",
  props: GenericHtmlProps,
) => Promise<{ html: string; text: string }>;

// The published package exports a strongly typed registry covering every
// Wander email. Keeping this adapter narrow prevents that entire template map
// from leaking into Growth's oRPC output inference while runtime composition
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
 * A self-contained "image needed" tile for a home with no chosen photo.
 *
 * A data URI rather than a hosted asset: email clients need an absolute URL,
 * and this has to work in the preview before anything has been uploaded
 * anywhere. It is deliberately obvious — a digest must never go out with these
 * still in it.
 */
function digestImagePlaceholder(name: string): string {
  const label = name.replace(/[<>&]/g, "").slice(0, 28).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="600" height="400" fill="#e8e4dd"/><rect x="12" y="12" width="576" height="376" fill="none" stroke="#b9b1a4" stroke-width="3" stroke-dasharray="14 10"/><text x="300" y="186" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="26" font-weight="bold" fill="#6f6659">IMAGE NEEDED</text><text x="300" y="222" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="17" fill="#8a8175">${label}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/**
 * Every newsletter is one layout: the brand's frame, the subject, the intro,
 * the main button, and whatever home sections the issue has (none makes it a
 * plain editorial email).
 */
async function renderNewsletter(input: NewsletterRenderInput) {
  const digest = input.document.digest;

  const { render } = await import("@react-email/render");
  const { default: ListingsDigest } =
    await import("../../../emails/marketing/ListingsDigest");

  const money = (value: number | null | undefined) =>
    typeof value === "number" ? `$${value.toLocaleString("en-US")}` : null;

  const chrome = newsletterChrome(input);
  const flow = await bodyFlow(
    input.document.bodyMarkdown,
    digest?.sections.length ?? 0,
    Boolean(input.blockIds),
  );
  // Homes placed inside the copy lead to the issue's own button; a second
  // "see all" button under them would compete with it.
  const placesHomes = flow.some((item) => item.kind === "group");
  const sectionCtas = !(placesHomes && input.document.ctaUrl);
  const siteUrl = input.sender?.siteUrl;
  const element = ListingsDigest({
    ...chrome,
    // The issue's own button, when it has one, is the email's main one.
    primaryCta:
      input.document.ctaUrl && input.document.ctaLabel
        ? { label: input.document.ctaLabel, href: input.document.ctaUrl }
        : chrome.primaryCta,
    // The issue's theme is its line above the homes; an issue without one
    // goes straight to them.
    trending: digest?.theme
      ? { kicker: "This week", heading: digest.theme }
      : undefined,
    previewText:
      input.document.preheader || input.document.subject || input.brandName,
    heading: input.document.subject || "",
    flow,
    sections: (digest?.sections ?? []).map((section) => {
      const [featured, ...more] = section.properties;
      const showPrices = section.showPrices !== false;
      const toCard = (
        property: (typeof section.properties)[number],
        featured: boolean,
      ) => ({
        // The state when the home knows it; else the section heading's
        // trailing region ("AUSTIN + HILL COUNTRY, TX").
        location: [
          property.city,
          property.state ??
            (section.heading.includes(",")
              ? section.heading.split(",").pop()?.trim()
              : null),
        ]
          .filter(Boolean)
          .join(", "),
        guests: property.sleeps ?? undefined,
        title: property.name,
        note: property.note?.trim() || undefined,
        // The price line the issue carries (the paste's, or the home's
        // cheapest stay on wander.com); else whatever rate the paste stated.
        // A group can leave prices out.
        priceLabel: !showPrices
          ? ""
          : property.priceLabel?.trim()
            ? property.priceLabel.trim()
            : [
                money(property.nightlyUsd)
                  ? `${money(property.nightlyUsd)}/night`
                  : null,
                money(property.perPersonUsd)
                  ? `~${money(property.perPersonUsd)}/person`
                  : null,
              ]
                .filter(Boolean)
                .join(" · "),
        // Only a wander.com match carries savings; a brand's own homes don't.
        savingsLabel:
          showPrices && property.savingsUsd
            ? savingsLabel(property.savingsUsd, featured)
            : undefined,
        // An empty src makes the browser refetch the whole page, and renders
        // as a broken card in the preview. A visible placeholder says "an
        // image goes here and nobody has chosen one yet", which is the true
        // state, and names the home so the operator knows what to source.
        image: {
          src: property.imageUrl ?? digestImagePlaceholder(property.name),
          alt: property.imageUrl
            ? property.name
            : `${property.name} — image needed`,
        },
        href: property.href ?? "",
      });
      return {
        heading: section.heading,
        layout: section.layout,
        featured: toCard(featured!, true),
        more: more.map((property) => toCard(property, false)),
        cta: !sectionCtas
          ? undefined
          : section.explore
            ? {
                label: `Explore ${section.explore.place}`,
                href: section.explore.href,
              }
            : siteUrl
              ? { label: "See all homes", href: siteUrl }
              : undefined,
      };
    }),
  });

  let html = emailSafeImages(await render(element), siteUrl);
  let text = await render(element, { plainText: true });
  if (input.recipient) {
    html = fillFields(html, input.recipient, { html: true });
    text = fillFields(text, input.recipient, { html: false });
  }
  // The layout has no separate "body": the whole email is. Send-time
  // snapshots want the field either way.
  return { html, text, bodyHtml: html };
}

/**
 * WanderOS product updates keep the design system's generic operator email;
 * every newsletter and blast renders through the one newsletter layout.
 */
export async function renderDesignSystemNewsletter(
  input: NewsletterRenderInput,
) {
  if (!input.document.productUpdate) return renderNewsletter(input);

  const bodyHtml = await markdownHtml(input.document.bodyMarkdown);
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
    footer: "wander",
    marketing: false,
    unsubscribeUrl: "#",
  });
  return { ...rendered, bodyHtml };
}
