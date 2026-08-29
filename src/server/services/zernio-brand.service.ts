import "server-only";

import { and, eq, inArray, isNotNull, ne, notInArray } from "drizzle-orm";

import { db } from "@/server/db";
import {
  brandTable,
  channelTable,
  type ChannelPlatform,
} from "@/server/db/schema";
import {
  isZernioConfigured,
  listZernioAccounts,
  listZernioProfiles,
  mapZernioPlatform,
  type ZernioAccount,
} from "@/server/clients/zernio.client";
import { createId } from "@/server/db/utils";
import { R2 } from "@/server/clients/r2.client";

function accountProfileId(account: ZernioAccount): string | null {
  if (typeof account.profileId === "string") return account.profileId;
  return account.profileId?._id ?? null;
}

function accountId(account: ZernioAccount): string | null {
  return account._id ?? account.id ?? null;
}

function canonicalProfileUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.toLowerCase().replace(/\/+$/, "");
    return `${host}${path}`;
  } catch {
    return null;
  }
}

function connectionStatus(account: ZernioAccount) {
  if (account.platformStatus?.toLowerCase() === "error")
    return "error" as const;
  if (account.isActive === false || account.enabled === false) {
    return "disconnected" as const;
  }
  return "connected" as const;
}

export async function getZernioBrandCatalog() {
  if (!isZernioConfigured) {
    return { configured: false as const, profiles: [] };
  }

  const [profiles, accounts, assignments] = await Promise.all([
    listZernioProfiles({ includeOverLimit: true }),
    listZernioAccounts(),
    db.query.brandTable.findMany({
      where: isNotNull(brandTable.zernioProfileId),
      columns: { id: true, name: true, zernioProfileId: true },
    }),
  ]);

  const assignmentByProfile = new Map(
    assignments
      .filter((brand) => brand.zernioProfileId)
      .map((brand) => [
        brand.zernioProfileId!,
        { id: brand.id, name: brand.name },
      ]),
  );

  return {
    configured: true as const,
    profiles: profiles.flatMap((profile) => {
      if (!profile._id) return [];
      return [
        {
          id: profile._id,
          name: profile.name ?? "Untitled profile",
          isDefault: profile.isDefault ?? false,
          assignedBrand: assignmentByProfile.get(profile._id) ?? null,
          accounts: accounts.flatMap((account) => {
            const id = accountId(account);
            if (!id || accountProfileId(account) !== profile._id) return [];
            return [
              {
                id,
                platform: mapZernioPlatform(account.platform),
                username: account.username ?? null,
                displayName: account.displayName ?? account.name ?? null,
                profileUrl: account.profileUrl ?? null,
                profileImageUrl:
                  account.profilePicture ?? account.profilePictureUrl ?? null,
                followerCount: account.followersCount ?? null,
                connectionStatus: connectionStatus(account),
              },
            ];
          }),
        },
      ];
    }),
  };
}

export async function connectBrandToZernioProfile(
  brandId: string,
  profileId: string,
) {
  if (!isZernioConfigured) throw new Error("Zernio is not configured");

  const [profiles, accounts] = await Promise.all([
    listZernioProfiles({ includeOverLimit: true }),
    listZernioAccounts(),
  ]);
  const profile = profiles.find((candidate) => candidate._id === profileId);
  if (!profile) throw new Error("That Zernio profile no longer exists");

  const assignedElsewhere = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.zernioProfileId, profileId),
      ne(brandTable.id, brandId),
    ),
    columns: { name: true },
  });
  if (assignedElsewhere) {
    throw new Error(
      `The Zernio profile is already assigned to ${assignedElsewhere.name}`,
    );
  }

  const profileAccounts = accounts.filter(
    (account) => accountProfileId(account) === profileId && accountId(account),
  );
  const externalIds = profileAccounts.flatMap((account) => {
    const id = accountId(account);
    return id ? [id] : [];
  });

  if (externalIds.length > 0) {
    const conflicting = await db.query.channelTable.findFirst({
      where: and(
        eq(channelTable.defaultProvider, "zernio"),
        inArray(channelTable.externalId, externalIds),
        ne(channelTable.brandId, brandId),
      ),
      with: { brand: true },
    });
    if (conflicting) {
      throw new Error(
        `A connected Zernio account is already assigned to ${conflicting.brand?.name ?? "another brand"}`,
      );
    }
  }

  await db
    .update(brandTable)
    .set({ zernioProfileId: profileId })
    .where(eq(brandTable.id, brandId));

  let inserted = 0;
  let updated = 0;
  for (const account of profileAccounts) {
    const externalId = accountId(account)!;
    const platform = mapZernioPlatform(account.platform) as ChannelPlatform;
    const isAdChannel = platform.endsWith("_ads");
    let existing = await db.query.channelTable.findFirst({
      where: and(
        eq(channelTable.brandId, brandId),
        eq(channelTable.defaultProvider, "zernio"),
        eq(channelTable.externalId, externalId),
      ),
      columns: { id: true, profileImageUrl: true, metadata: true },
    });
    // An ad channel is keyed by the platform's ad account, which this call
    // does not know, so match on the aggregator id we stored — and failing
    // that, adopt the brand's existing ad channel for this platform rather
    // than adding a second one beside it.
    if (!existing && isAdChannel) {
      const adChannels = await db.query.channelTable.findMany({
        where: and(
          eq(channelTable.brandId, brandId),
          eq(channelTable.platform, platform),
          eq(channelTable.kind, "ad"),
        ),
        columns: { id: true, profileImageUrl: true, metadata: true },
      });
      existing =
        adChannels.find(
          (candidate) =>
            (candidate.metadata as Record<string, unknown> | null)
              ?.zernioAccountId === externalId,
        ) ?? adChannels[0];
    }
    // A profile may have been discovered and accepted before the account was
    // connected in Zernio. Adopt that channel instead of creating a duplicate.
    if (!existing) {
      const normalizedUsername = account.username
        ?.replace(/^@/, "")
        .toLowerCase();
      const normalizedProfileUrl = canonicalProfileUrl(account.profileUrl);
      const candidates = await db.query.channelTable.findMany({
        where: and(
          eq(channelTable.brandId, brandId),
          eq(channelTable.platform, platform),
        ),
        columns: {
          id: true,
          handle: true,
          profileUrl: true,
          profileImageUrl: true,
          metadata: true,
        },
      });
      existing = candidates.find(
        (candidate) =>
          (normalizedUsername &&
            candidate.handle?.replace(/^@/, "").toLowerCase() ===
              normalizedUsername) ||
          (normalizedProfileUrl &&
            canonicalProfileUrl(candidate.profileUrl) === normalizedProfileUrl),
      );
    }
    const existingMetadata =
      (existing?.metadata as Record<string, unknown> | null) ?? {};
    const manualProfileImage = existingMetadata.profileImageManual === true;
    const providerProfileImage =
      account.profilePicture ?? account.profilePictureUrl ?? null;
    let profileImageUrl = manualProfileImage
      ? (existing?.profileImageUrl ?? null)
      : providerProfileImage;
    if (
      !manualProfileImage &&
      providerProfileImage &&
      R2.needsRehost(providerProfileImage)
    ) {
      try {
        profileImageUrl = await R2.putFromUrl(
          R2.buildUploadKey(
            "channel-avatars",
            existing?.id ?? externalId,
            "avatar",
          ),
          providerProfileImage,
        );
      } catch {
        profileImageUrl = existing?.profileImageUrl ?? providerProfileImage;
      }
    }
    const values = {
      kind: isAdChannel ? ("ad" as const) : ("social" as const),
      platform,
      handle: account.username ?? null,
      displayName: account.displayName ?? account.name ?? null,
      profileUrl: account.profileUrl ?? null,
      profileImageUrl,
      // `externalId` on an AD channel is the PLATFORM's ad-account id
      // (act_…), which only ads-sync learns. Claiming Zernio's own account id
      // here made sync unable to recognise the row and create a second one —
      // two "Meta Ads" cards for one connection. The aggregator's id lives in
      // metadata instead, and the row waits for sync to fill externalId.
      ...(isAdChannel ? {} : { externalId }),
      connectionStatus: connectionStatus(account),
      defaultProvider: "zernio" as const,
      followerCount: account.followersCount ?? null,
      isActive: account.isActive !== false && account.enabled !== false,
      deletedAt: null,
      metadata: {
        ...existingMetadata,
        zernioProfileId: profileId,
        zernioAccountId: externalId,
        zernioPlatform: account.platform,
        zernioPlatformStatus: account.platformStatus ?? null,
      },
    };
    if (existing) {
      await db
        .update(channelTable)
        .set(values)
        .where(eq(channelTable.id, existing.id));
      updated++;
    } else {
      await db.insert(channelTable).values({
        id: createId("chan"),
        brandId,
        ...values,
      });
      inserted++;
    }
  }

  const staleWhere = [
    eq(channelTable.brandId, brandId),
    eq(channelTable.defaultProvider, "zernio"),
  ];
  await db
    .update(channelTable)
    .set({ connectionStatus: "disconnected", isActive: false })
    .where(
      externalIds.length > 0
        ? and(...staleWhere, notInArray(channelTable.externalId, externalIds))
        : and(...staleWhere),
    );

  return {
    profileId,
    profileName: profile.name ?? "Untitled profile",
    accounts: profileAccounts.length,
    inserted,
    updated,
  };
}
