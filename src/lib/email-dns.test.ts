import { describe, expect, test } from "bun:test";
import { emailDnsInputSchema, marketingDnsRecords } from "./email-dns";

const setup = {
  rootDomain: "brand.co.uk",
  sendingDomain: "updates.brand.co.uk",
  postmarkDomainId: 123,
  token: "a".repeat(32),
  createdAt: "2026-10-02T00:00:00.000Z",
  expiresAt: "2026-10-09T00:00:00.000Z",
};
const domain = {
  Name: setup.sendingDomain,
  DKIMHost: `old._domainkey.${setup.sendingDomain}`,
  DKIMTextValue: "old-key",
  DKIMPendingHost: `new._domainkey.${setup.sendingDomain}`,
  DKIMPendingTextValue: "new-key",
  ReturnPathDomain: `pm-bounces.${setup.sendingDomain}`,
  ReturnPathDomainCNAMEValue: "pm.mtasv.net",
};

describe("marketing email DNS scope", () => {
  test("accepts configurable subdomains and rejects URLs, IPs and nested labels", () => {
    for (const subdomain of ["news", "mail", "updates", "post", "wander"])
      expect(
        emailDnsInputSchema.parse({
          brandId: "brand",
          rootDomain: "Brand.co.uk",
          subdomain,
        }).rootDomain,
      ).toBe("brand.co.uk");
    for (const rootDomain of [
      "https://brand.com",
      "brand.com/path",
      "127.0.0.1",
      "localhost",
      "brand..com",
    ])
      expect(
        emailDnsInputSchema.safeParse({
          brandId: "brand",
          rootDomain,
          subdomain: "news",
        }).success,
      ).toBe(false);
    expect(
      emailDnsInputSchema.safeParse({
        brandId: "brand",
        rootDomain: "brand.com",
        subdomain: "news.mail",
      }).success,
    ).toBe(false);
  });

  test("uses the pending rotation key and only email records relative to the explicit DNS zone", () => {
    expect(marketingDnsRecords(domain, setup)).toEqual([
      {
        type: "TXT",
        host: "new._domainkey.updates",
        value: "new-key",
        ttl: 300,
      },
      {
        type: "CNAME",
        host: "pm-bounces.updates",
        value: "pm.mtasv.net",
        ttl: 300,
      },
    ]);
    expect(
      marketingDnsRecords(
        { ...domain, DKIMPendingHost: "", DKIMPendingTextValue: "" },
        setup,
      )[0]?.value,
    ).toBe("old-key");
  });

  test("rejects missing keys, a mismatched provider domain and records outside the marketing subdomain", () => {
    expect(() =>
      marketingDnsRecords({ ...domain, Name: "other.com" }, setup),
    ).toThrow();
    expect(() =>
      marketingDnsRecords(
        { ...domain, ReturnPathDomain: "pm-bounces.brand.co.uk" },
        setup,
      ),
    ).toThrow();
    expect(() =>
      marketingDnsRecords(
        {
          ...domain,
          DKIMHost: "",
          DKIMTextValue: "",
          DKIMPendingHost: "",
          DKIMPendingTextValue: "",
        },
        setup,
      ),
    ).toThrow();
  });
});
