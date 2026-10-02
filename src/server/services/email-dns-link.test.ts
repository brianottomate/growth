import { isConnectionToken, newConnectionToken } from "./connection-token";
import { expect, test } from "bun:test";
import { emailDnsLinkActive } from "./email-dns-link";
const now = Date.UTC(2026, 9, 2);
test("email setup expires and rejects signed or malformed credentials", () => {
  const token = newConnectionToken();
  const setup = {
    rootDomain: "brand.com",
    sendingDomain: "post.brand.com",
    postmarkDomainId: 1,
    token,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 1000).toISOString(),
  };
  expect(isConnectionToken(token)).toBe(true);
  expect(emailDnsLinkActive(setup, now)).toBe(true);
  expect(emailDnsLinkActive(setup, now + 1000)).toBe(false);
  expect(emailDnsLinkActive({ ...setup, expiresAt: "invalid" }, now)).toBe(
    false,
  );
  for (const invalid of ["", "old.payload.signature", "x".repeat(3000)])
    expect(isConnectionToken(invalid)).toBe(false);
});
