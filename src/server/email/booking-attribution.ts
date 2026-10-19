import { parse, type DefaultTreeAdapterMap } from "parse5";

export const RECIPIENT_KEY_PLACEHOLDER = "__GROWTH_EMAIL_RECIPIENT_KEY__";

/** Tag only this brand's website links; leave external links and provider placeholders alone. */
export function tagBookingLinks(
  html: string,
  input: { siteUrl: string; sendId: string; campaign: string },
): string {
  const site = new URL(input.siteUrl);
  const document = parse(html, { sourceCodeLocationInfo: true });
  const replacements: { start: number; end: number; value: string }[] = [];
  const visit = (node: DefaultTreeAdapterMap["node"]) => {
    if ("tagName" in node && node.tagName === "a") {
      const href = node.attrs.find((attribute) => attribute.name === "href");
      if (
        href &&
        /^https?:\/\//i.test(href.value) &&
        URL.canParse(href.value)
      ) {
        const url = new URL(href.value);
        if (url.origin === site.origin) {
          url.searchParams.set("utm_source", "wander_performance");
          url.searchParams.set("utm_medium", "email");
          url.searchParams.set("utm_campaign", input.campaign);
          url.searchParams.set("utm_id", input.sendId);
          url.searchParams.set("utm_content", "booking_link");
          // Email has no paid-search keyword; carry recipient identity separately from utm_id.
          url.searchParams.set("utm_term", RECIPIENT_KEY_PLACEHOLDER);
          const location = node.sourceCodeLocation?.attrs?.href;
          if (location)
            replacements.push({
              start: location.startOffset,
              end: location.endOffset,
              value: `href="${url.href.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}"`,
            });
        }
      }
    }
    if ("childNodes" in node) node.childNodes.forEach(visit);
  };
  visit(document);
  // Patch only href attributes; preserve the renderer's doctype and email-client markup.
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    html =
      html.slice(0, replacement.start) +
      replacement.value +
      html.slice(replacement.end);
  }
  return html;
}
