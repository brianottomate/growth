import { describe, expect, it } from "bun:test";

import {
  parseFfmpegProbe,
  renditionArgs,
  renditionPlan,
} from "@/lib/video-renditions";

// Trimmed `ffmpeg -i` output for a DaVinci Resolve export of a Chalets Reel.
const RESOLVE_EXPORT = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'Grande.mov':
  Duration: 00:00:12.22, start: 0.000000, bitrate: 27147 kb/s
  Stream #0:0[0x1]: Video: hevc (Main 10) (hvc1 / 0x31637668), yuv420p10le(tv, bt709, progressive), 2160x3840 [SAR 1:1 DAR 9:16], 26994 kb/s, 29.97 fps, 29.97 tbr, 30k tbn (default)
  Stream #0:1[0x2]: Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 319 kb/s (default)
  Stream #0:2[0x3](eng): Data: none (tmcd / 0x64636D74), 0 kb/s (default)
At least one output file must be specified`;

describe("parseFfmpegProbe", () => {
  it("reads size, length, codec and audio off an editor export", () => {
    expect(parseFfmpegProbe(RESOLVE_EXPORT)).toEqual({
      width: 2160,
      height: 3840,
      durationMs: 12_220,
      videoCodec: "hevc",
      hasAudio: true,
    });
  });

  it("reports the displayed size of a phone clip stored sideways", () => {
    const phone = `  Duration: 00:00:08.50, start: 0.000000, bitrate: 9000 kb/s
  Stream #0:0[0x1](und): Video: hevc (Main) (hvc1 / 0x31637668), yuv420p(tv, bt709), 1920x1080, 8900 kb/s, 30 fps (default)
      Side data:
        displaymatrix: rotation of -90.00 degrees`;
    expect(parseFfmpegProbe(phone)).toMatchObject({
      width: 1080,
      height: 1920,
      hasAudio: false,
    });
  });

  it("returns null when ffmpeg found no video", () => {
    expect(
      parseFfmpegProbe("Invalid data found when processing input"),
    ).toBeNull();
  });
});

describe("renditionPlan", () => {
  it("scales a 4K 9:16 master to 1080x1920 and cuts a 1080x1350 feed crop", () => {
    expect(renditionPlan({ width: 2160, height: 3840 })).toEqual({
      delivery: { width: 1080, height: 1920 },
      feed: { cropWidth: 2160, cropHeight: 2700, width: 1080, height: 1350 },
      vertical: true,
    });
  });

  it("never upscales, and keeps a landscape clip landscape with no feed crop", () => {
    expect(renditionPlan({ width: 1280, height: 720 })).toEqual({
      delivery: { width: 1280, height: 720 },
      feed: null,
      vertical: false,
    });
  });

  it("does not call a 4:5 clip vertical, and has nothing to crop", () => {
    const plan = renditionPlan({ width: 1080, height: 1350 });
    expect(plan.vertical).toBe(false);
    expect(plan.feed).toBeNull();
  });

  it("decodes once and writes the feed crop from the same pass", () => {
    const args = renditionArgs({
      source: "https://r2.test/master.mov",
      plan: renditionPlan({ width: 2160, height: 3840 }),
      deliveryPath: "/tmp/d.mp4",
      feedPath: "/tmp/f.mp4",
      threads: 1,
    });
    expect(args.filter((arg) => arg === "-i")).toHaveLength(1);
    expect(args).toContain("/tmp/d.mp4");
    expect(args).toContain("/tmp/f.mp4");
    expect(args.join(" ")).toContain("+faststart");
  });
});
