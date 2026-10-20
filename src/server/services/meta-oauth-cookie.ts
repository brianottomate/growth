import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "@/env";
import {
  readMetaOAuthSession,
  sealMetaOAuthSession,
  type MetaOAuthSession,
} from "@/lib/meta-oauth-session";
const name = (token: string) =>
  `growth-meta-${createHash("sha256").update(token).digest("hex").slice(0, 16)}`;
const options = (token: string) => ({
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: `/connect/${token}/meta`,
  maxAge: 900,
});
function secret() {
  if (!env.BETTER_AUTH_SECRET)
    throw new Error("OAuth session secret unavailable");
  return env.BETTER_AUTH_SECRET;
}
export async function metaOAuthSession(token: string) {
  return readMetaOAuthSession(
    (await cookies()).get(name(token))?.value,
    token,
    secret(),
  );
}
export async function saveMetaOAuthSession(
  token: string,
  session: MetaOAuthSession,
) {
  const value = await sealMetaOAuthSession(session, token, secret());
  if (value.length > 3800) throw new Error("OAuth session is too large");
  (await cookies()).set(name(token), value, options(token));
}
export async function clearMetaOAuthSession(token: string) {
  (await cookies()).set(name(token), "", { ...options(token), maxAge: 0 });
}
