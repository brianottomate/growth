import { type DigestProperty, type ListingsDigest } from "./listings-digest";

/**
 * A property digest as Customer.io Design Studio code, one block per market,
 * to paste into the issue's Code view.
 *
 * The markup is the weekly newsletter's own, copied from the "[Copy] Weekly
 * full base email" file (2026-09): a featured home full width, the rest as
 * 40/60 rows, a green savings button under each, an "Explore" button to the
 * market's search, and an empty divider section between markets. Anything
 * the digest does not know is left out rather than invented, so a block with
 * a missing photo or price is visibly short, not wrong.
 */

const SECTION_OPEN =
  '<x-section data-layer-label="Section 1 — button" width="600px" outer-background="#f5f4f0" background="#ffffff" padding="0px 32px 4px">';
const DIVIDER =
  '<x-section data-layer-label="Section 1 — label" width="600px" outer-background="#f5f4f0" background="#ffffff" padding="0px 32px 4px">\n    <x-hr :height="1" background-color="#eee" margin="20px 0px 10px" />\n  </x-section>';
const INTRO_ATTRS =
  'data-layer-label="Section 1 — intro" :font-size="12" :line-height="1.47" color="#5f5f5f" margin="5px 0px 0px" :letter-spacing="0.15" font-weight="600"';
const SAVINGS_ATTRS =
  'data-layer-label="Section 1 — setup button" align="left" margin="8px 0px" background="rgba(175, 179, 175, 0.2)" color="#306530" padding="12px"';

const text = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const attr = (value: string) => text(value).replace(/"/g, "&quot;");

/** "SAN DIEGO COAST, CA" reads as "San Diego Coast, CA"; mixed case is kept. */
export function sectionTitle(heading: string) {
  if (heading !== heading.toUpperCase()) return heading;
  return heading
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
    .replace(
      /,\s*([a-z]{2})$/i,
      (_, code: string) => `, ${code.toUpperCase()}`,
    );
}

/** "PARK CITY, UTAH • 12 GUESTS" */
function placeLine(property: DigestProperty) {
  const place = [property.city, property.state].filter(Boolean).join(", ");
  const guests = property.sleeps ? `${property.sleeps} GUESTS` : null;
  return [place, guests].filter(Boolean).join(" • ").toUpperCase();
}

/** "Home in Park City, Utah • ★ 5.0" featured, "Home in Park City • ★ 4.9" in a list. */
function homeTitle(property: DigestProperty, featured: boolean) {
  const place = featured
    ? [property.city, property.state].filter(Boolean).join(", ")
    : property.city;
  const stars = `★ ${property.rating ? property.rating.toFixed(1) : "New"}`;
  return place ? `Home in ${place} • ${stars}` : `${property.name} • ${stars}`;
}

function priceLine(property: DigestProperty) {
  if (property.priceLabel?.trim()) return property.priceLabel.trim();
  if (property.nightlyUsd)
    return `$${property.nightlyUsd.toLocaleString("en-US")}/night`;
  return null;
}

function savingsButton(
  property: DigestProperty,
  href: string,
  featured: boolean,
) {
  if (!property.savingsUsd) return "";
  const amount = `Save ~$${property.savingsUsd.toLocaleString("en-US")}`;
  return `<x-cta ${SAVINGS_ATTRS} href="${attr(href)}">${text(featured ? `${amount} booking on Wander` : `${amount} on Wander`)}</x-cta>`;
}

function featuredHome(property: DigestProperty) {
  const href = property.href ?? "https://www.wander.com";
  const price = priceLine(property);
  return [
    property.imageUrl
      ? `<x-image src="${attr(property.imageUrl)}" border-radius="12px 12px 12px 12px" margin="0px 0px 15px" href="${attr(href)}" />`
      : "",
    `<x-paragraph ${INTRO_ATTRS}><span style="color:  rgb(32, 32, 32)">${text(placeLine(property))}</span></x-paragraph>`,
    `<x-heading-2 :font-size="22" margin="5px 0px">${text(homeTitle(property, true))}</x-heading-2>`,
    price
      ? `<x-paragraph margin="15px 0px 10px">${text(price)}</x-paragraph>`
      : "",
    savingsButton(property, href, true),
  ].join("");
}

function listedHome(property: DigestProperty) {
  const href = property.href ?? "https://www.wander.com";
  const price = priceLine(property);
  const image = property.imageUrl
    ? `<x-image src="${attr(property.imageUrl)}" margin="5px 0px" border-radius="10px 10px 10px 10px" href="${attr(href)}" />`
    : "";
  return [
    `<x-row :gap="8" :layout='[40,60]' padding="15px 1px 5px" margin="0px 0px 10px">`,
    `<x-column>${image}</x-column>`,
    `<x-column padding="0px 10px">`,
    `<x-paragraph ${INTRO_ATTRS}><span style="color:  rgb(32, 32, 32)">${text(placeLine(property))}</span></x-paragraph>`,
    `<x-heading-2 :font-size="18" margin="5px 0px 10px">${text(homeTitle(property, false))}</x-heading-2>`,
    price
      ? `<x-paragraph margin="5px 0px 10px">${text(price)}</x-paragraph>`
      : "",
    savingsButton(property, href, false),
    `</x-column></x-row>`,
  ].join("");
}

function marketBlock(section: ListingsDigest["sections"][number]) {
  const [featured, ...rest] = section.properties;
  const body = [
    `<x-heading-2 :font-size="22" margin="15px 0px 20px">${text(sectionTitle(section.heading))}</x-heading-2>`,
    featured ? featuredHome(featured) : "",
    rest.length
      ? `<x-hr :height="1" background-color="#eee" margin="25px 0px 15px" />${rest
          .map(listedHome)
          .join('<x-hr :height="1" background-color="#eee" margin="0" />')}`
      : "",
  ].join("");
  const explore = section.explore
    ? `\n    <x-cta data-layer-label="Section 1 — setup button" href="${attr(section.explore.href)}" align="left" margin="20px 0px" padding="15px 20px">${text(`Explore ${section.explore.place} →`)}</x-cta>`
    : "";
  return `${SECTION_OPEN}${body}${explore}\n  </x-section>`;
}

// Her greeting, Liquid and all: Customer.io fills the first name at send.
const GREETING =
  '👋 Hi there{% if customer["first name"] != blank %} {{customer["first name"]}}{% endif %},';
const PARAGRAPH_ATTRS =
  'data-layer-label="Greeting" :font-size="16" :line-height="1.5" color="#3a3a3a" margin="0px 0px 20px" :letter-spacing="0" font-weight="400"';

/** Markdown's inline bold and links, as the paragraph markup takes them. */
function inline(markdown: string) {
  return text(markdown)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      (_, label: string, href: string) => `<a href="${href}">${label}</a>`,
    );
}

/**
 * The "Greeting + intro" section: the greeting line, then the issue's intro
 * paragraphs. A salutation the intro opens with ("Hello,") is dropped, since
 * the greeting line is the salutation.
 */
function introBlock(bodyMarkdown: string) {
  const paragraphs = bodyMarkdown
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .filter(
      (paragraph, index) =>
        index > 0 || !/^(hello|hi|hey)\b[^.!?]{0,30},$/i.test(paragraph),
    );
  return [
    '<x-section data-layer-label="Greeting + intro" width="600px" outer-background="#f5f4f0" background="#ffffff" padding="10px 32px 4px"><x-hr :height="1" background-color="#eee" margin="10px 0px 20px" />',
    `    <x-paragraph ${PARAGRAPH_ATTRS}>${GREETING}</x-paragraph>${paragraphs
      .map(
        (paragraph) =>
          `<x-paragraph ${PARAGRAPH_ATTRS}>${inline(paragraph)}</x-paragraph>`,
      )
      .join("")}`,
    "  </x-section>",
  ].join("\n");
}

/**
 * Every market block, divided the way the weekly issue divides them, with
 * the greeting and intro above when the issue has intro copy.
 */
export function digestDesignStudioCode(
  digest: ListingsDigest,
  options: { bodyMarkdown?: string | null } = {},
) {
  const markets = digest.sections.map(marketBlock).join(`\n  ${DIVIDER}\n  `);
  return options.bodyMarkdown?.trim()
    ? `${introBlock(options.bodyMarkdown)}\n  ${markets}`
    : markets;
}
