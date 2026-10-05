import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { isOwnedChatImagePath, isOwnedChatImageUrl } from "./chat-attachment";
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
