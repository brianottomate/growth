// Isolate module mocks from the rest of the Bun suite.
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const setup = {
  rootDomain: "example.com",
  sendingDomain: "post.example.com",
  postmarkDomainId: 123,
  token: "a".repeat(32),
  createdAt: "2020-01-01T00:00:00.000Z",
  expiresAt: "2020-06-01T00:00:00.000Z",
};
const brand = {
  id: "brand_fixture",
  organizationId: "org_fixture",
  emailSender: { fromName: "Example", marketingDomain: setup },
};
const domain = {
  Name: setup.sendingDomain,
  DKIMUpdateStatus: "Verified",
  ReturnPathDomainVerified: true,
  DKIMHost: "key._domainkey.post.example.com",
  DKIMTextValue: "key",
  DKIMPendingHost: "",
  DKIMPendingTextValue: "",
  ReturnPathDomain: "pm-bounces.post.example.com",
  ReturnPathDomainCNAMEValue: "pm.mtasv.net",
};
let reads = 0;
let verifications = 0;
let dnsLookups = 0;
let updates = 0;
const dialect = new PgDialect();
await mock.module("@/server/db", () => ({
  db: {
    query: {
      brandTable: {
        findFirst: async ({ where }: { where: SQL }) => {
          const { params } = dialect.sqlToQuery(where);
          if (params.includes("foreign")) return undefined;
          const token = params.find(
            (p) => typeof p === "string" && /^[a-zA-Z0-9_-]{32}$/.test(p),
          );
          return token && token !== brand.emailSender.marketingDomain.token
            ? undefined
            : brand;
        },
      },
    },
    update: () => ({
      set: ({ emailSender }: { emailSender: SQL }) => {
        const query = dialect.sqlToQuery(emailSender);
        assert.match(query.sql, /jsonb_set/);
        const issued = JSON.parse(
          query.params.find(
            (p): p is string => typeof p === "string" && p.startsWith("{"),
          )!,
        ) as Pick<typeof setup, "token" | "createdAt" | "expiresAt">;
        assert.deepEqual(Object.keys(issued).sort(), [
          "createdAt",
          "expiresAt",
          "token",
        ]);
        brand.emailSender.marketingDomain = {
          ...brand.emailSender.marketingDomain,
          ...issued,
        };
        updates++;
        return { where: () => ({ returning: async () => [{ id: brand.id }] }) };
      },
    }),
  },
}));
await mock.module("@/server/clients/postmark.client", () => ({
  getPostmarkDomain: async () => {
    reads++;
    return domain;
  },
}));
await mock.module("@/server/clients/postmark-domain.client", () => ({
  ensurePostmarkMarketingDomain: async () => {
    throw new Error("Rotation must not provision a domain");
  },
  verifyPostmarkMarketingDomain: async (id: number) => {
    assert.equal(id, 123);
    verifications++;
    return domain;
  },
}));
await mock.module("@/server/clients/entri.client", () => ({
  createEmailEntriConfig: async () => ({}),
  isEntriConfigured: () => false,
}));
await mock.module("@/server/services/email-dmarc.service", () => ({
  getEmailDmarcStatus: async () => {
    dnsLookups++;
    return {
      state: "found",
      hostname: "_dmarc.example.com",
      inherited: true,
      policy: "reject",
      value: "v=DMARC1; p=reject",
    };
  },
}));

const {
  recheckBrandEmailDns,
  recheckEmailDnsConnection,
  replaceBrandEmailDnsLink,
  resolveEmailDnsLink,
  getBrandEmailDns,
} = await import("@/server/services/email-dns.service");
const checked = await recheckBrandEmailDns(brand.id, brand.organizationId);
assert.equal(checked?.status.verified, true);
assert.equal(verifications, 1);
assert.equal(reads, 0, "internal recheck must not pre-read Postmark");
assert.equal(
  await recheckEmailDnsConnection(setup.token),
  null,
  "expired public links remain denied",
);
assert.equal(verifications, 1);
await assert.rejects(
  () => recheckBrandEmailDns(brand.id, "foreign"),
  /Brand not found/,
);
await assert.rejects(
  () => replaceBrandEmailDnsLink(brand.id, "foreign"),
  /Brand not found/,
);
assert.equal(updates, 0, "foreign workspaces cannot rotate credentials");
assert.equal(verifications, 1);

// Rotate an active link and prove the old credential is revoked without changing domain identity.
setup.expiresAt = "2099-01-01T00:00:00.000Z";
assert.ok(await resolveEmailDnsLink(setup.token));
const replaced = await replaceBrandEmailDnsLink(brand.id, brand.organizationId);
assert.notEqual(brand.emailSender.marketingDomain.token, setup.token);
assert.equal(await resolveEmailDnsLink(setup.token), null);
assert.ok(await resolveEmailDnsLink(brand.emailSender.marketingDomain.token));
assert.equal(
  brand.emailSender.marketingDomain.sendingDomain,
  setup.sendingDomain,
);
assert.equal(
  brand.emailSender.marketingDomain.postmarkDomainId,
  setup.postmarkDomainId,
);
assert.equal(brand.emailSender.fromName, "Example");
assert.equal(reads, 0, "rotation needs no provider reads");
assert.equal(
  verifications,
  1,
  "rotation must not reverify or provision a domain",
);
assert.ok(replaced.path.endsWith(brand.emailSender.marketingDomain.token));
await getBrandEmailDns(brand.id, brand.organizationId);
assert.equal(dnsLookups, 0, "routine status reads must not add DMARC lookups");
const publicStatus = await recheckEmailDnsConnection(
  brand.emailSender.marketingDomain.token,
);
assert.equal(publicStatus?.dmarc.state, "found");
assert.equal(dnsLookups, 1);
console.log(
  "Email DNS ownership, expiry, rotation and lookup contracts passed",
);
