import { createHash } from "node:crypto";
import { EncryptJWT, jwtDecrypt } from "jose";
import { z } from "zod";

const returnTo = z.enum(["connect", "intake"]);
export const metaOAuthGrantSchema = z.object({
  phase: z.literal("grant"),
  profileId: z.string().min(1).max(200),
  tempToken: z.string().min(1).max(2048),
  connectToken: z.string().min(1).max(4096),
  userProfile: z.object({
    id: z.string().min(1).max(200),
    name: z.string().max(300),
    profilePicture: z.string().max(2000).optional(),
  }),
  returnTo,
});
const schema = z.discriminatedUnion("phase", [
  z.object({
    phase: z.literal("start"),
    state: z.string().length(32),
    returnTo,
  }),
  metaOAuthGrantSchema,
]);
export type MetaOAuthSession = z.infer<typeof schema>;
export type MetaOAuthGrant = z.infer<typeof metaOAuthGrantSchema>;
const key = (secret: string) =>
  createHash("sha256")
    .update("growth:client-meta-oauth:v1:")
    .update(secret)
    .digest();

/** A browser's temporary OAuth grant, never the brand's stored agency token. */
export async function sealMetaOAuthSession(
  session: MetaOAuthSession,
  brandToken: string,
  secret: string,
  expiresAt = Math.floor(Date.now() / 1000) + 900,
) {
  return new EncryptJWT(schema.parse(session))
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setSubject(brandToken)
    .setExpirationTime(expiresAt)
    .encrypt(key(secret));
}
export async function readMetaOAuthSession(
  value: string | undefined,
  brandToken: string,
  secret: string,
): Promise<MetaOAuthSession | null> {
  if (!value) return null;
  try {
    const { payload } = await jwtDecrypt(value, key(secret), {
      subject: brandToken,
      keyManagementAlgorithms: ["dir"],
      contentEncryptionAlgorithms: ["A256GCM"],
    });
    return schema.parse(payload);
  } catch {
    return null;
  }
}
