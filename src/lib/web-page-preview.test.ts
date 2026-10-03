import { describe, expect, test } from "bun:test";
import { webPagePreview, publicPreviewUrl } from "./web-page-preview";
import { readWebPageOutputSchema } from "@/server/ai/capabilities/outputs/research";

describe("page read unfurls", () => {
  test("shows the site's social copy and resolves relative image assets", () => {
    expect(
      webPagePreview("https://example.com/stays/", {
        ogTitle: " Oceanfront   stays ",
        title: "Home",
        ogDescription: "Book directly on the beach.",
        description: "Navigation",
        ogImage: "../social.jpg",
        ogSiteName: "Coastal Stays",
      }),
    ).toEqual({
      title: "Oceanfront stays",
      description: "Book directly on the beach.",
      imageUrl: "https://example.com/social.jpg",
      siteName: "Coastal Stays",
    });
  });

  test("falls back to ordinary metadata without inventing a scraped-text description", () => {
    expect(
      webPagePreview("https://example.com", {
        title: "Home",
        description: "Book a stay",
      }),
    ).toEqual({
      title: "Home",
      description: "Book a stay",
      imageUrl: undefined,
      siteName: undefined,
    });
    expect(
      webPagePreview("https://example.com", { title: "Home" }).description,
    ).toBeUndefined();
  });

  test("does not load private, credential-bearing or executable image URLs", () => {
    for (const value of [
      "javascript:alert(1)",
      "data:image/svg+xml,test",
      "http://localhost/image.jpg",
      "http://127.0.0.1/a",
      "https://user:secret@example.com/a",
    ]) {
      expect(publicPreviewUrl(value, "https://example.com")).toBeUndefined();
    }
    expect(
      webPagePreview("https://example.com", {
        ogImage: "data:image/png,test",
        "twitter:image": "//cdn.example.com/photo.jpg",
      }).imageUrl,
    ).toBe("https://cdn.example.com/photo.jpg");
  });

  test("saved results remain readable and new unfurls survive the wire contract", () => {
    const old = {
      note: "External evidence",
      provider: "firecrawl",
      text: "Page content",
      title: "Home",
      untrustedContent: true,
      url: "https://example.com",
    };
    expect(readWebPageOutputSchema.safeParse(old).success).toBe(true);
    const preview = webPagePreview(old.url, {
      ogImage: "/share.jpg",
      ogDescription: "Book a stay",
    });
    expect(readWebPageOutputSchema.parse({ ...old, preview })).toMatchObject({
      preview,
    });
    expect(
      readWebPageOutputSchema.safeParse({ ...old, provider: "exa", preview })
        .success,
    ).toBe(true);
  });
});
