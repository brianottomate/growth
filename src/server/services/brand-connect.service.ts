import "server-only";

import { randomBytes } from "node:crypto";

import { and, eq, isNotNull, isNull } from "drizzle-orm";

import { env } from "@/env";
import { db } from "@/server/db";
import { brandTable, channelTable } from "@/server/db/schema";
import {
  createZernioProfile,
  getZernioConnectUrl,
  isZernioConfigured,
  listZernioProfiles,
  type ZernioConnectPlatform,
} from "@/server/clients/zernio.client";
import { connectBrandToZernioProfile } from "@/server/services/zernio-brand.service";

// ---- BRAND CONNECT: the client-facing onboarding link ----------------
//
// A Performance customer connects their own social + ad accounts into their
// brand's Zernio profile through /connect/[token] — a public, no-login page.
// The token is the whole credential, so it must be unguessable and easy to
// revoke (regenerate). Internally the link lives on the brand page.
//
// The flow per channel: our start route asks Zernio for an OAuth authUrl
// (those expire, so they are minted per click — the share link itself is
// static) and 302s the client to the platform's consent screen. Zernio hosts
// any selection screens and sends the browser back to /connect/[token],
// where we re-sync the profile's accounts into channel rows.

/**
 * The channels a client can connect, in the order they appear on the page.
 * Meta ads uses /connect/facebook/ads, which skips the Page picker entirely.
 */
export const BRAND_CONNECT_CHANNELS = [
  {
    key: "instagram",
    label: "Instagram",
    target: { kind: "posting", platform: "instagram" },
    channelPlatform: "instagram",
  },
  {
    key: "facebook",
    label: "Facebook",
    target: { kind: "posting", platform: "facebook" },
    channelPlatform: "facebook",
  },
  {
    key: "meta-ads",
    label: "Meta Ads",
    target: { kind: "ads", platform: "facebook" },
    channelPlatform: "meta_ads",
  },
  {
    key: "google-ads",
    label: "Google Ads",
    target: { kind: "ads", platform: "googleads" },
    channelPlatform: "google_ads",
  },
] as const satisfies readonly {
  key: string;
  label: string;
  target: ZernioConnectPlatform;
  channelPlatform: string;
}[];

export type BrandConnectChannelKey =
  (typeof BRAND_CONNECT_CHANNELS)[number]["key"];

/**
 * Which kinds of connection a client is asked for.
 *
 * Posting is parked while Performance by Wander focuses on paid. The channel
 * definitions above stay exactly as they are: turning social back on is adding
 * "posting" to this list, not rebuilding the flow, the OAuth routes or the
 * sync. Nothing here disconnects anything — a brand that already has Instagram
 * keeps it, and content sync keeps reading it. This decides what we ASK for.
 */
export const OFFERED_CONNECT_KINDS: readonly ZernioConnectPlatform["kind"][] = [
  "ads",
];

export function isOfferedConnectChannel(key: string): boolean {
  const channel = BRAND_CONNECT_CHANNELS.find((row) => row.key === key);
  return Boolean(channel && OFFERED_CONNECT_KINDS.includes(channel.target.kind));
}

/** Exported so brand creation can stamp a token at insert (no Zernio call). */
export function newConnectToken(): string {
  return randomBytes(24).toString("base64url");
}

export function brandConnectUrl(token: string): string {
  return `${env.NEXT_PUBLIC_BASE_URL}/connect/${token}`;
}

/**
 * The Performance+ intake, on the same token.
 *
 * Points at wander.com, because that is where the form lives. It used to
 * build this app's own origin, which meant an operator copying the link off
 * a brand page sent a client the internal back-office domain and a stale copy
 * of the form. One credential still covers both surfaces, so regenerating
 * revokes this and the connect link together.
 *
 * A brand slug reads better than a token and resolves the same, so it is
 * preferred when the brand has one.
 */
export function brandIntakeUrl(handle: string): string {
  return `${env.WANDER_COM_BASE_URL}/internal/intake/${handle}`;
}

/**
 * The sales pitch page for a brand, on wander.com.
 *
 * Slug only. A rep sends this before anything is signed and reads it out over
 * a call, so it has to be readable, and the page it addresses shows only what
 * is already public on the client's own site.
 */
export function brandPitchUrl(slug: string): string {
  return `${env.WANDER_COM_BASE_URL}/internal/performance/${slug}`;
}

export async function getBrandByConnectToken(token: string) {
  if (!token || token.length < 16) return null;
  return db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.connectToken, token),
      isNotNull(brandTable.organizationId),
    ),
  });
}

/**
 * Make a brand connectable. Minting the token needs no Zernio call — the
 * Zernio profile is created lazily on the client's first Connect click
 * (ensureBrandZernioProfile), so a link exists the moment a brand does.
 */
export type ConnectIssuer = { name: string | null; email: string | null };

export async function ensureBrandConnect(
  brandId: string,
  issuedBy?: ConnectIssuer,
) {
  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, brandId),
  });
  if (!brand?.organizationId) {
    throw new Error("Only owned brands can have a connect link");
  }

  // Owned brands are minted with a token at creation (brand-ops.service), so
  // the issuer cannot be stamped there — nobody has asked for the link yet.
  // Whoever first reaches for it is the person the client should reply to.
  let token = brand.connectToken;
  const needsToken = !token;
  if (needsToken) token = newConnectToken();
  if (needsToken || (issuedBy && !brand.connectTokenIssuedAt)) {
    await db
      .update(brandTable)
      .set({
        connectToken: token,
        connectTokenIssuedByName: issuedBy?.name ?? null,
        connectTokenIssuedByEmail: issuedBy?.email ?? null,
        connectTokenIssuedAt: new Date(),
      })
      .where(eq(brandTable.id, brandId));
  }

  return { token: token!, url: brandConnectUrl(token!) };
}

/**
 * Resolve (or create) the brand's Zernio profile. Reuses an existing profile
 * with the brand's exact name rather than failing on the unique-name
 * constraint — the lookup must come first because profile create is NOT
 * idempotent, and it must never be auto-retried.
 */
async function ensureBrandZernioProfile(brand: {
  id: string;
  name: string;
  zernioProfileId: string | null;
}): Promise<string> {
  if (brand.zernioProfileId) return brand.zernioProfileId;
  if (!isZernioConfigured) throw new Error("Zernio is not configured");

  const existing = (await listZernioProfiles({ includeOverLimit: true })).find(
    (profile) => profile.name?.toLowerCase() === brand.name.toLowerCase(),
  );
  const profile =
    existing ??
    (await createZernioProfile({ name: brand.name, description: brand.id }));
  const profileId = profile._id;
  if (!profileId) throw new Error("Could not resolve a Zernio profile id");
  // Adopt the profile through the existing path so conflict checks and any
  // pre-connected accounts are handled the same way as a manual import.
  await connectBrandToZernioProfile(brand.id, profileId);
  return profileId;
}

/** Revoke the sent link by replacing it. The old URL stops resolving. */
export async function regenerateBrandConnectToken(
  brandId: string,
  issuedBy?: ConnectIssuer,
) {
  const token = newConnectToken();
  const [updated] = await db
    .update(brandTable)
    .set({
      connectToken: token,
      connectTokenIssuedByName: issuedBy?.name ?? null,
      connectTokenIssuedByEmail: issuedBy?.email ?? null,
      connectTokenIssuedAt: new Date(),
    })
    .where(eq(brandTable.id, brandId))
    .returning({ id: brandTable.id });
  if (!updated) throw new Error("Brand not found");
  return { token, url: brandConnectUrl(token) };
}

/**
 * Mint the per-click OAuth URL for one channel. The redirect sends the
 * client's browser back to the connect page, which re-syncs and shows the
 * tick. Throws "already_connected" when Zernio reports the account exists.
 */
export async function startBrandConnect(
  token: string,
  channelKey: BrandConnectChannelKey,
): Promise<string> {
  const brand = await getBrandByConnectToken(token);
  if (!brand) throw new Error("Unknown connect link");
  const channel = BRAND_CONNECT_CHANNELS.find(
    (candidate) => candidate.key === channelKey,
  );
  if (!channel) throw new Error("Unknown channel");

  const profileId = await ensureBrandZernioProfile(brand);
  return getZernioConnectUrl({
    target: channel.target,
    profileId,
    redirectUrl: `${brandConnectUrl(token)}?connected=${channel.key}`,
  });
}

/**
 * Connection status per offered channel, derived from the brand's channel
 * rows (which is what the post-OAuth sync writes). Zernio is not consulted
 * on render, so the public page stays fast and works even when Zernio is
 * briefly unreachable.
 */
export async function getBrandConnectStatus(brandId: string) {
  const channels = await db.query.channelTable.findMany({
    where: and(
      eq(channelTable.brandId, brandId),
      eq(channelTable.defaultProvider, "zernio"),
      // An ad channel has no externalId until ads-sync learns the platform's
      // ad-account id, but it is connected the moment the client authorises.
      isNull(channelTable.deletedAt),
    ),
    columns: {
      platform: true,
      handle: true,
      displayName: true,
      externalId: true,
    },
  });
  return BRAND_CONNECT_CHANNELS.map((channel) => {
    const connected = channels.filter(
      (row) => row.platform === channel.channelPlatform,
    );
    return {
      key: channel.key,
      label: channel.label,
      // Every channel is returned so the internal card can still show a
      // parked-but-connected account. The client page renders only what we
      // currently offer.
      offered: OFFERED_CONNECT_KINDS.includes(channel.target.kind),
      connected: connected.length > 0,
      accounts: connected.map((row) => row.handle ?? row.displayName ?? ""),
      // An ad channel carries the platform's own account id once sync learns
      // it. Showing it back is how a client confirms they granted the right
      // account rather than a personal one.
      externalIds: connected
        .map((row) => row.externalId)
        .filter((id): id is string => Boolean(id)),
    };
  });
}

/** Pull the profile's accounts into channel rows after a client connects. */
export async function syncBrandConnect(brandId: string) {
  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, brandId),
    columns: { id: true, zernioProfileId: true },
  });
  if (!brand?.zernioProfileId) return;
  await connectBrandToZernioProfile(brand.id, brand.zernioProfileId);
}
