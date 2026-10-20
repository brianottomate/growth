import { expect, test } from "bun:test";
import {
  sealMetaOAuthSession,
  readMetaOAuthSession,
  type MetaOAuthGrant,
} from "./meta-oauth-session";

// The brand link alone must not reveal another browser's fresh OAuth credential.
test("Meta OAuth grant stays encrypted, brand-bound and tamper-resistant", async () => {
  const grant: MetaOAuthGrant = {
    phase: "grant",
    profileId: "profile-a",
    tempToken: "private-provider-credential",
    connectToken: "headless-grant",
    userProfile: { id: "1", name: "Client" },
    returnTo: "intake",
  };
  const secret = "unit-test-auth-secret-not-a-real-credential";
  const sealed = await sealMetaOAuthSession(grant, "brand-a", secret);
  expect(sealed).not.toContain(grant.tempToken);
  expect(await readMetaOAuthSession(sealed, "brand-a", secret)).toEqual(grant);
  expect(await readMetaOAuthSession(sealed, "brand-b", secret)).toBeNull();
  expect(
    await readMetaOAuthSession(
      sealed.slice(0, -5) + "other",
      "brand-a",
      secret,
    ),
  ).toBeNull();
  expect(
    await readMetaOAuthSession(sealed, "brand-a", "wrong-secret"),
  ).toBeNull();
  const expired = await sealMetaOAuthSession(
    grant,
    "brand-a",
    secret,
    Math.floor(Date.now() / 1000) - 60,
  );
  expect(await readMetaOAuthSession(expired, "brand-a", secret)).toBeNull();
});
