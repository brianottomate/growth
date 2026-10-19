import { expect, test } from "bun:test";
import {
  signEmailPreviewToken,
  verifyEmailPreviewToken,
} from "./email-preview-token";

test("email preview links bind the exact selection to the brand key and expiry", () => {
  const claims = {
    brandId: "brand-a",
    organizationId: "org-a",
    platformPostIds: ["email-1", "email-2"],
    expiresAt: 2000,
  };
  const token = signEmailPreviewToken(claims, "test-secret", "brand-key");
  expect(
    verifyEmailPreviewToken(token, "test-secret", "brand-key", 1000),
  ).toEqual(claims);
  expect(
    verifyEmailPreviewToken(token, "test-secret", "rotated-brand-key", 1000),
  ).toBeNull();
  expect(
    verifyEmailPreviewToken(token, "test-secret", "brand-key", 2000),
  ).toBeNull();
  const payload = Buffer.from(
    JSON.stringify({
      ...claims,
      brandId: "brand-b",
      platformPostIds: ["other-email"],
    }),
  ).toString("base64url");
  expect(
    verifyEmailPreviewToken(
      `${payload}.${token.split(".")[1]}`,
      "test-secret",
      "brand-key",
      1000,
    ),
  ).toBeNull();
  expect(
    verifyEmailPreviewToken("malformed", "test-secret", "brand-key", 1000),
  ).toBeNull();
});
