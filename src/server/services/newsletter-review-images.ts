import "server-only";
import sanitizeHtml from "sanitize-html";

// Only these known public CDNs are fetched by our server. Other hosts remain
// browser-loaded and may appear as labeled placeholders if they prohibit CORS.
const HOSTS = new Set([
  "assets.wander.com",
  "userimg.customer.io",
  "images.customer.io",
]);

export async function embedNewsletterReviewImages(
  html: string,
): Promise<string> {
  const sources = new Set<string>();
  sanitizeHtml(html, {
    transformTags: {
      img: (tagName, attribs) => {
        if (attribs.src) sources.add(attribs.src);
        return { tagName, attribs };
      },
    },
  });
  const embedded = new Map<string, string>();
  await Promise.all(
    [...sources].slice(0, 12).map(async (src) => {
      try {
        const url = new URL(src);
        if (
          url.protocol !== "https:" ||
          !HOSTS.has(url.hostname) ||
          url.port ||
          url.username ||
          url.password
        )
          return;
        // Wander's published 640px variant fits the email preview and avoids
        // downloading multi-megabyte full-resolution listing photos.
        if (url.hostname === "assets.wander.com") {
          url.pathname = url.pathname.replace(/\/fullres\.webp$/, "/640.webp");
        }
        const response = await fetch(url, {
          redirect: "error",
          signal: AbortSignal.timeout(5000),
          cache: "force-cache",
        });
        const type = response.headers.get("content-type")?.split(";")[0];
        if (
          !response.ok ||
          !type ||
          !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(type)
        )
          return;
        if (Number(response.headers.get("content-length")) > 1024 * 1024)
          return;
        const reader = response.body?.getReader();
        if (!reader) return;
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 1024 * 1024) {
            await reader.cancel();
            return;
          }
          chunks.push(value);
        }
        embedded.set(
          src,
          `data:${type};base64,${Buffer.concat(chunks).toString("base64")}`,
        );
      } catch {
        /* Optional preview asset; capture labels missing images. */
      }
    }),
  );
  // Input is already sanitized. Replace only exact escaped attribute values.
  return html.replace(/src="([^"]+)"/g, (attribute, encoded: string) => {
    const raw = encoded.replace(/&amp;/g, "&");
    const data = embedded.get(raw);
    return data ? `src="${data}"` : attribute;
  });
}
