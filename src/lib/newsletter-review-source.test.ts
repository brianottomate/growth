import { describe, expect, test } from "bun:test";
import { newsletterCaptureHtml } from "./newsletter-review-source";
describe("newsletter review snapshot", () => {
  test("capture blocks script, event handlers, forms and navigation", () => {
    const html =
      '<meta http-equiv="refresh" content="0;url=https://evil.test"><script>alert(1)</script><form action="https://evil.test"><input></form><img src="https://example.com/photo.jpg" onerror="alert(2)"><a href="javascript:alert(3)">link</a>';
    const capture = newsletterCaptureHtml(html);
    expect(capture).not.toContain("<script");
    expect(capture).not.toContain("onerror");
    expect(capture).not.toContain("<form");
    expect(capture).not.toContain('http-equiv="refresh"');
    expect(capture).not.toContain("javascript:");
    expect(capture).toContain("default-src 'none'");
    expect(capture).toContain("https://example.com/photo.jpg");
  });
});
