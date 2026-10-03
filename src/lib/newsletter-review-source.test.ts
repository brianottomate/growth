import { describe, expect, test } from "bun:test";
import {
  newsletterCaptureHtml,
  newsletterReviewCopy,
} from "./newsletter-review-source";

describe("newsletter review snapshot", () => {
  test("preserves footer copy and destinations without executable source", () => {
    const html =
      '<style>body{color:red}</style><script>alert(1)</script><p>Hello &amp; welcome</p><a href="https://example.com/home">Book</a><footer>123 Main Street</footer>';
    const copy = newsletterReviewCopy(html);
    expect(copy).toContain("Hello & welcome");
    expect(copy).toContain("https://example.com/home");
    expect(copy).toContain("123 Main Street");
    expect(copy).not.toContain("alert(1)");
    expect(copy).not.toContain("color:red");
  });

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

  test("uses declared template image defaults without fabricating guest data", () => {
    const capture = newsletterCaptureHtml(
      "<img src=\"{{customer.image | default: 'https://example.com/default.jpg'}}\"><p>{{customer.first_name}}</p>",
    );
    expect(capture).toContain('src="https://example.com/default.jpg"');
    expect(capture).toContain("{{customer.first_name}}");
  });
});
