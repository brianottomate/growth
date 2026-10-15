import { expect, test } from "bun:test";
import { privatePerformanceLinks } from "./performance-client-links";

const setup = {
  rootDomain: "example.com",
  sendingDomain: "post.example.com",
  postmarkDomainId: 1,
  token: "d".repeat(32),
  createdAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2099-01-01T00:00:00.000Z",
};

test("a guessable intake slug never exposes either private setup credential", () => {
  expect(privatePerformanceLinks(false, "c".repeat(32), setup)).toEqual({
    connect: null,
    emailDns: null,
  });
  const privateLinks = privatePerformanceLinks(true, "c".repeat(32), setup);
  expect(privateLinks.connect).toBe(
    `https://growth-red.vercel.app/connect/${"c".repeat(32)}`,
  );
  expect(privateLinks.emailDns).toBe(
    `https://growth-red.vercel.app/connect/email/${setup.token}`,
  );
});

test("an expired DNS credential is withheld without blocking account setup", () => {
  const links = privatePerformanceLinks(true, "c".repeat(32), {
    ...setup,
    expiresAt: "2000-01-01T00:00:00.000Z",
  });
  expect(links.emailDns).toBeNull();
  expect(links.connect).not.toBeNull();
});
