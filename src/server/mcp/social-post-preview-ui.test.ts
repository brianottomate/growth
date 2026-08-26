import { describe, expect, test } from "bun:test";

import {
  MCP_APP_MIME_TYPE,
  SOCIAL_POST_PREVIEW_HTML,
  SOCIAL_POST_PREVIEW_URI,
} from "./social-post-preview-ui";

describe("social post MCP App resource", () => {
  test("uses a versioned UI resource and the MCP Apps MIME type", () => {
    expect(SOCIAL_POST_PREVIEW_URI).toBe(
      "ui://wander-growth/social-post-preview/v1.html",
    );
    expect(MCP_APP_MIME_TYPE).toBe("text/html;profile=mcp-app");
  });

  test("supports the MCP Apps lifecycle and ChatGPT compatibility data", () => {
    expect(SOCIAL_POST_PREVIEW_HTML).toContain('method:"ui/initialize"');
    expect(SOCIAL_POST_PREVIEW_HTML).toContain(
      'message.method==="ui/notifications/tool-result"',
    );
    expect(SOCIAL_POST_PREVIEW_HTML).toContain("window.openai.toolOutput");
    expect(SOCIAL_POST_PREVIEW_HTML).not.toContain("<script src=");
  });
});
