import { describe, expect, it } from "bun:test";

import {
  deliveryPayload,
  validatePublishSettings,
} from "@/server/services/content-publishing.service";

const video = { url: "https://cdn.test/reel.mp4", type: "video" as const };
const image = { url: "https://cdn.test/a.jpg", type: "image" as const };
const item = (media: (typeof video | typeof image)[]) => ({
  id: "pp_1",
  text: "Fall weekend in the hills",
  media,
  sequence: null,
  deliveryExternalId: null,
  deliveryStatus: null,
  deliveryError: null,
});

describe("Reel payloads", () => {
  it("marks a Facebook Reel as one, with its title", () => {
    const payload = deliveryPayload({
      platform: "facebook",
      format: "facebook.reel",
      items: [item([video])],
      publishSettings: { title: "Fall at the Falls" },
    });
    expect(payload.platformSpecificData).toEqual({
      contentType: "reel",
      title: "Fall at the Falls",
    });
  });

  it("leaves a Facebook feed video a feed video", () => {
    const payload = deliveryPayload({
      platform: "facebook",
      format: "facebook.video",
      items: [item([video])],
    });
    expect(payload.platformSpecificData).toBeUndefined();
  });

  it("refuses a Reel without exactly one video", () => {
    for (const platform of ["facebook", "instagram"] as const) {
      expect(() =>
        deliveryPayload({
          platform,
          format: `${platform}.reel`,
          items: [item([image])],
        }),
      ).toThrow("exactly one vertical");
    }
  });

  it("maps Instagram Reel options onto Zernio's fields", () => {
    const payload = deliveryPayload({
      platform: "instagram",
      format: "instagram.reel",
      items: [item([video])],
      firstComment: "#hockinghills",
      publishSettings: {
        coverUrl: "https://cdn.test/cover.jpg",
        shareToFeed: false,
        trial: "SS_PERFORMANCE",
        collaborators: ["wander"],
      },
    });
    expect(payload.platformSpecificData).toEqual({
      firstComment: "#hockinghills",
      instagramThumbnail: "https://cdn.test/cover.jpg",
      shareToFeed: false,
      trialParams: { graduationStrategy: "SS_PERFORMANCE" },
      collaborators: ["wander"],
    });
  });
});

describe("validatePublishSettings", () => {
  it("keeps Reel-only options off feed posts", () => {
    expect(() =>
      validatePublishSettings({
        platform: "instagram",
        format: "instagram.image",
        settings: { trial: "MANUAL" },
      }),
    ).toThrow("Instagram Reels");
    expect(() =>
      validatePublishSettings({
        platform: "facebook",
        format: "facebook.reel",
        settings: { shareToFeed: false },
      }),
    ).toThrow("only a Reel title");
  });

  it("normalises collaborators and caps them at three", () => {
    expect(
      validatePublishSettings({
        platform: "instagram",
        format: "instagram.reel",
        settings: { collaborators: ["@wander", " chaletshh "] },
      }).collaborators,
    ).toEqual(["wander", "chaletshh"]);
    expect(() =>
      validatePublishSettings({
        platform: "instagram",
        format: "instagram.reel",
        settings: { collaborators: ["a", "b", "c", "d"] },
      }),
    ).toThrow("at most 3");
  });
});
