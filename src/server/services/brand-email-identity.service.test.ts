import { describe, expect, test } from "bun:test";

import type {
  BrandEmailSender,
  BrandLegalIdentity,
} from "@/server/db/brand-schema";
import {
  BrandEmailIdentityError,
  planBrandEmailIdentityUpdate,
} from "./brand-email-identity.service";

const marketingDomain = {
  rootDomain: "example.com",
  sendingDomain: "post.example.com",
  postmarkDomainId: 123,
  token: "a".repeat(32),
  createdAt: "2026-10-22T00:00:00.000Z",
  expiresAt: "2027-10-22T00:00:00.000Z",
};

const input = {
  fromName: " Example Stays ",
  fromEmail: "HELLO@Post.Example.Com",
  replyTo: "Reservations@Example.com",
  legalName: " Example Stays LLC ",
  address: {
    line1: " 1 Main Street ",
    line2: " ",
    city: " Denver ",
    region: " CO ",
    postalCode: " 80202 ",
    country: " us ",
  },
};

describe("planBrandEmailIdentityUpdate", () => {
  test("patches sender and footer while preserving unrelated canonical fields", () => {
    const emailSender: BrandEmailSender = {
      fromName: "Old name",
      marketingDomain,
      tagline: "Book direct",
      siteUrl: "https://example.com",
    };
    const legalIdentity: BrandLegalIdentity = {
      email: "legal@example.com",
      phone: "+1 555 0100",
      registration: "CO 123",
    };

    const result = planBrandEmailIdentityUpdate(input, {
      emailSender,
      legalIdentity,
    });

    expect(result.sendingDomain).toBe("post.example.com");
    expect(result.emailSender).toEqual({
      fromName: "Example Stays",
      fromEmail: "hello@post.example.com",
      replyTo: "reservations@example.com",
      marketingDomain,
      tagline: "Book direct",
      siteUrl: "https://example.com",
    });
    expect(result.legalIdentity).toEqual({
      email: "legal@example.com",
      phone: "+1 555 0100",
      registration: "CO 123",
      legalName: "Example Stays LLC",
      address: {
        line1: "1 Main Street",
        line2: null,
        city: "Denver",
        region: "CO",
        postalCode: "80202",
        country: "US",
      },
    });
  });

  test("rejects a From address outside the prepared marketing domain", () => {
    expect(() =>
      planBrandEmailIdentityUpdate(
        { ...input, fromEmail: "hello@example.com" },
        {
          emailSender: { fromName: "Example Stays", marketingDomain },
          legalIdentity: null,
        },
      ),
    ).toThrow(
      new BrandEmailIdentityError(
        "BAD_REQUEST",
        "The From address must use post.example.com.",
      ),
    );
  });

  test("rejects a sender before a marketing domain is prepared", () => {
    expect(() =>
      planBrandEmailIdentityUpdate(input, {
        emailSender: { fromName: "Example Stays" },
        legalIdentity: null,
      }),
    ).toThrow(
      new BrandEmailIdentityError(
        "BAD_REQUEST",
        "Prepare this brand's authenticated marketing domain before setting its sender.",
      ),
    );
  });
});
