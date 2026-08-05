import { describe, expect, test } from "bun:test";

import { buildZernioReschedulePayload } from "./zernio-reschedule";

describe("Zernio reschedule payload", () => {
  test("preserves provider copy, media, target settings, and metadata", () => {
    const result = buildZernioReschedulePayload(
      {
        _id: "provider_1",
        content: "approved copy",
        mediaItems: [{ type: "image", url: "https://example.com/a.jpg" }],
        platforms: [
          {
            platform: "instagram",
            accountId: { _id: "account_1" },
            platformSpecificData: { firstComment: "hello" },
          },
        ],
        metadata: { growthPlatformPostId: "pp_1" },
      },
      "2026-08-20T12:00:00.000Z",
    );
    expect(result.content).toBe("approved copy");
    expect(result.platforms[0]?.accountId).toBe("account_1");
    expect(result.platforms[0]?.platformSpecificData).toEqual({
      firstComment: "hello",
    });
    expect(result.scheduledFor).toBe("2026-08-20T12:00:00.000Z");
  });
});
