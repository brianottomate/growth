import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
  findLatestOwnedChatImage,
  findLatestOwnedChatImages,
  isOwnedChatImagePath,
  isOwnedChatImageUrl,
} from "./chat-attachment";

const ORIGINAL_BASE = process.env.R2_PUBLIC_BASE_URL;

beforeAll(() => {
  process.env.R2_PUBLIC_BASE_URL = "https://media.growth.wander.com";
});

afterAll(() => {
  if (ORIGINAL_BASE === undefined) delete process.env.R2_PUBLIC_BASE_URL;
  else process.env.R2_PUBLIC_BASE_URL = ORIGINAL_BASE;
});

describe("isOwnedChatImageUrl", () => {
  test("accepts the operator's own public chat upload", () => {
    expect(
      isOwnedChatImageUrl(
        "https://media.growth.wander.com/uploads/chat/usr_123/att_file-image.png",
        "usr_123",
      ),
    ).toBe(true);
  });

  test("rejects another operator's chat upload", () => {
    expect(
      isOwnedChatImageUrl(
        "https://media.growth.wander.com/uploads/chat/usr_other/att_file-image.png",
        "usr_123",
      ),
    ).toBe(false);
  });

  test("rejects lookalike hosts and non-https URLs", () => {
    expect(
      isOwnedChatImageUrl(
        "https://media.growth.wander.com.evil.test/uploads/chat/usr_123/image.png",
        "usr_123",
      ),
    ).toBe(false);
    expect(
      isOwnedChatImageUrl(
        "http://media.growth.wander.com/uploads/chat/usr_123/image.png",
        "usr_123",
      ),
    ).toBe(false);
  });

  test("fails closed when the public base URL is unset", () => {
    const saved = process.env.R2_PUBLIC_BASE_URL;
    delete process.env.R2_PUBLIC_BASE_URL;
    expect(
      isOwnedChatImageUrl(
        "https://media.growth.wander.com/uploads/chat/usr_123/image.png",
        "usr_123",
      ),
    ).toBe(false);
    process.env.R2_PUBLIC_BASE_URL = saved;
  });
});

describe("findLatestOwnedChatImages", () => {
  const first = {
    type: "file",
    mediaType: "image/png",
    url: "https://media.growth.wander.com/uploads/chat/usr_123/att_first.png",
  };
  const second = {
    type: "file",
    mediaType: "image/jpeg",
    url: "https://media.growth.wander.com/uploads/chat/usr_123/att_second.jpg",
  };

  test("returns the complete newest image set in message order", () => {
    expect(
      findLatestOwnedChatImages(
        [
          { role: "user", parts: [{ ...first, url: `${first.url}?older=1` }] },
          {
            role: "user",
            parts: [first, { type: "text", text: "Use these" }, second],
          },
          {
            role: "user",
            parts: [{ type: "text", text: "Attach the images I pasted" }],
          },
        ],
        "usr_123",
      ),
    ).toEqual([
      { url: first.url, mediaType: first.mediaType },
      { url: second.url, mediaType: second.mediaType },
    ]);
  });

  test("filters foreign and non-image files without dropping owned images", () => {
    expect(
      findLatestOwnedChatImages(
        [
          {
            role: "user",
            parts: [
              first,
              {
                ...second,
                url: "https://media.growth.wander.com/uploads/chat/usr_other/att.jpg",
              },
              {
                type: "file",
                mediaType: "application/pdf",
                url: first.url,
              },
            ],
          },
        ],
        "usr_123",
      ),
    ).toEqual([{ url: first.url, mediaType: first.mediaType }]);
  });

  test("keeps the singular lookup compatible", () => {
    expect(
      findLatestOwnedChatImage(
        [{ role: "user", parts: [first, second] }],
        "usr_123",
      ),
    ).toEqual({ url: second.url, mediaType: second.mediaType });
  });
});

describe("isOwnedChatImagePath", () => {
  test("accepts only a direct file in the operator's chat folder", () => {
    expect(
      isOwnedChatImagePath("uploads/chat/usr_123/att-image.png", "usr_123"),
    ).toBe(true);
    expect(
      isOwnedChatImagePath(
        "other/uploads/chat/usr_123/att-image.png",
        "usr_123",
      ),
    ).toBe(false);
    expect(
      isOwnedChatImagePath(
        "uploads/chat/usr_123/nested/att-image.png",
        "usr_123",
      ),
    ).toBe(false);
    expect(
      isOwnedChatImagePath("uploads/chat/usr_other/att-image.png", "usr_123"),
    ).toBe(false);
  });
});
