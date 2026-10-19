/** Browser previews can use first-party source assets behind WanderOS image proxies.
 * Keep the canonical email layout; Outlook's JPEG proxy is only needed for delivery.
 */
export function connectorEmailHtml(html: string) {
  return html.replace(
    /(<img\b[^>]*\bsrc=")([^"]+)(")/gi,
    (match: string, before: string, source: string, after: string) => {
      if (!/^https:\/\/[^/]+\/i\//i.test(source)) return match;
      const url = new URL(source.replaceAll("&amp;", "&"));
      const original = url.pathname.startsWith("/i/")
        ? url.searchParams.get("src")
        : null;
      if (!original) return match;
      const asset = new URL(original);
      if (
        asset.protocol !== "https:" ||
        !["assets.wander.com", "assets-websites.wander.com"].includes(
          asset.hostname,
        )
      )
        return match;
      return (
        before +
        asset.href.replaceAll("&", "&amp;").replaceAll('"', "&quot;") +
        after
      );
    },
  );
}
