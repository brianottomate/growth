import { describe, expect, it } from "bun:test";

import { videoEvidence } from "./media-analysis.service";

/**
 * What a video analysis is allowed to claim depends on what it looked at. A
 * storyboard supports key beats and pacing; one poster frame does not; and no
 * frames at all is "cannot analyze", which must not be reported as an analysis.
 */
describe("videoEvidence", () => {
  const board = (index: number) => ({
    index,
    url: `https://r2.test/v.mp4.board-${index}.png`,
  });

  it("prefers the storyboard, in board order, capped at ten", () => {
    const boards = [3, 0, 2, 1, 4, 5, 6, 7, 8, 9, 10, 11].map(board);
    const evidence = videoEvidence({
      storyboard: { boards },
      thumbnailUrl: "https://r2.test/v.mp4.thumb.webp",
    });
    expect(evidence?.source).toBe("storyboard");
    expect(evidence?.imageUrls).toHaveLength(10);
    expect(evidence?.imageUrls[0]).toBe(board(0).url);
    expect(evidence?.imageUrls[9]).toBe(board(9).url);
  });

  it("falls back to the poster and says so", () => {
    expect(
      videoEvidence({
        storyboard: null,
        thumbnailUrl: "https://r2.test/v.mp4.thumb.webp",
      }),
    ).toEqual({
      imageUrls: ["https://r2.test/v.mp4.thumb.webp"],
      source: "poster",
    });
    expect(
      videoEvidence({ storyboard: { boards: [] }, thumbnailUrl: "https://p" })
        ?.source,
    ).toBe("poster");
  });

  it("returns null when there is nothing to look at", () => {
    expect(videoEvidence({ storyboard: null, thumbnailUrl: null })).toBeNull();
    expect(videoEvidence({})).toBeNull();
  });
});
