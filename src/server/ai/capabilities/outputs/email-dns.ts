import { z } from "zod";

const emailDnsRecordSchema = z.strictObject({
  type: z.enum(["TXT", "CNAME"]),
  host: z.string(),
  value: z.string(),
  ttl: z.number().int().positive(),
});

const policy = z.enum(["none", "quarantine", "reject"]);
export const emailDmarcStatusSchema = z.union([
  z.strictObject({
    state: z.literal("found"),
    hostname: z.string(),
    inherited: z.boolean(),
    policy,
    value: z.string(),
  }),
  z.strictObject({
    state: z.literal("missing"),
    suggestedRecord: emailDnsRecordSchema,
  }),
  z.strictObject({
    state: z.enum(["invalid", "unavailable"]),
    hostname: z.string(),
  }),
]);

export const configuredEmailDnsSchema = z.strictObject({
  configured: z.literal(true),
  dmarc: emailDmarcStatusSchema,
  rootDomain: z.string(),
  sendingDomain: z.string(),
  records: z.array(emailDnsRecordSchema),
  dkimVerified: z.boolean(),
  returnPathVerified: z.boolean(),
  verified: z.boolean(),
  connectionUrl: z.string().url(),
  connectionActive: z.boolean(),
  expiresAt: z.string().datetime(),
});

export const emailDnsStatusSchema = z.union([
  z.strictObject({ state: z.literal("unavailable"), error: z.string() }),
  z.strictObject({ configured: z.literal(false) }),
  configuredEmailDnsSchema,
]);
