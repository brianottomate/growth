import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const claimsSchema = z.strictObject({
  brandId: z.string().min(1),
  organizationId: z.string().min(1),
  platformPostIds: z.array(z.string().min(1).max(80)).min(1).max(24),
  expiresAt: z.number().int().positive(),
});
export type EmailPreviewClaims = z.infer<typeof claimsSchema>;
function signature(payload: string, secret: string, brandToken: string) {
  return createHmac("sha256", secret)
    .update("growth:email-preview:v1\0")
    .update(brandToken)
    .update("\0")
    .update(payload)
    .digest();
}
/** Only use these claims for a scoped brand lookup before verification. */
export function inspectEmailPreviewToken(token: string) {
  if (token.length > 12000) return null;
  const [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra !== undefined) return null;
  try {
    return claimsSchema.parse(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    );
  } catch {
    return null;
  }
}
export function signEmailPreviewToken(
  claims: EmailPreviewClaims,
  secret: string,
  brandToken: string,
) {
  const payload = Buffer.from(
    JSON.stringify(claimsSchema.parse(claims)),
  ).toString("base64url");
  return `${payload}.${signature(payload, secret, brandToken).toString("base64url")}`;
}
export function verifyEmailPreviewToken(
  token: string,
  secret: string,
  brandToken: string,
  now = Date.now(),
) {
  const claims = inspectEmailPreviewToken(token);
  if (!claims || claims.expiresAt <= now) return null;
  const [payload, sig] = token.split(".");
  const expected = signature(payload!, secret, brandToken),
    given = Buffer.from(sig!, "base64url");
  return given.length === expected.length && timingSafeEqual(given, expected)
    ? claims
    : null;
}
