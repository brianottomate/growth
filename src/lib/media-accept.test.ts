import { describe, expect, it } from "bun:test";

import {
  MAX_IMAGE_UPLOAD_BYTES,
  MAX_VIDEO_UPLOAD_BYTES,
  MEDIA_ACCEPT,
  MEDIA_MIME,
  MEDIA_VIDEO_MIME_TYPES,
  maxUploadBytesFor,
  STILL_MEDIA_ACCEPT,
} from "./media-accept";

/**
 * The drop zone and the uploader read the same table on purpose. When the zone
 * advertised `image/*` it accepted an iPhone HEIC that the uploader then
 * refused, which is the failure these cover.
 */
describe("media accept table", () => {
  it("advertises no type the uploader will not take", () => {
    for (const mimeType of Object.keys(MEDIA_ACCEPT)) {
      expect(maxUploadBytesFor(mimeType)).not.toBeNull();
    }
  });

  it("carries no wildcard, which would let HEIC and SVG past the zone", () => {
    for (const mimeType of Object.keys({
      ...MEDIA_ACCEPT,
      ...STILL_MEDIA_ACCEPT,
    })) {
      expect(mimeType).not.toContain("*");
    }
  });

  it("gives every advertised type at least one extension, for folder picks", () => {
    // A folder pick bypasses react-dropzone's MIME filtering and is re-checked
    // by extension, so an empty list silently drops the format.
    for (const extensions of Object.values(MEDIA_ACCEPT)) {
      expect(extensions.length).toBeGreaterThan(0);
    }
  });

  it("offers video only in the media map, not the stills-only one", () => {
    for (const mimeType of MEDIA_VIDEO_MIME_TYPES) {
      expect(MEDIA_ACCEPT[mimeType]).toBeDefined();
      expect(STILL_MEDIA_ACCEPT[mimeType]).toBeUndefined();
    }
  });

  it("keeps GIF a kind of its own, as kindForMime expects", () => {
    expect(MEDIA_MIME.image).not.toContain("image/gif");
    expect(MEDIA_MIME.gif).toContain("image/gif");
  });

  it("caps video at the ceiling createUploadUrl enforces", () => {
    // The server's zod bound; a looser client cap means the operator waits
    // through a poster decode to be told the number is too big.
    expect(MAX_VIDEO_UPLOAD_BYTES).toBe(250 * 1024 * 1024);
    expect(maxUploadBytesFor("video/mp4")).toBe(MAX_VIDEO_UPLOAD_BYTES);
    expect(maxUploadBytesFor("image/png")).toBe(MAX_IMAGE_UPLOAD_BYTES);
    expect(maxUploadBytesFor("image/heic")).toBeNull();
  });
});
