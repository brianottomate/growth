import assert from "node:assert/strict";

import { describe, test } from "bun:test";

import {
  DESKTOP_APP_LANDING,
  isMobileUserAgent,
  MOBILE_APP_LANDING,
} from "./device";

describe("isMobileUserAgent", () => {
  test("recognizes common phone and tablet user agents", () => {
    assert.equal(
      isMobileUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
      ),
      true,
    );
    assert.equal(
      isMobileUserAgent(
        "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit Mobile",
      ),
      true,
    );
    assert.equal(
      isMobileUserAgent("Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)"),
      true,
    );
  });

  test("keeps desktop and missing agents on the desktop landing", () => {
    assert.equal(
      isMobileUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"),
      false,
    );
    assert.equal(isMobileUserAgent(null), false);
  });

  test("keeps the mobile landing out of the chat-first workspace", () => {
    assert.equal(MOBILE_APP_LANDING, "/app/review");
    assert.equal(DESKTOP_APP_LANDING, "/app/next");
    assert.notEqual(MOBILE_APP_LANDING, DESKTOP_APP_LANDING);
  });
});
