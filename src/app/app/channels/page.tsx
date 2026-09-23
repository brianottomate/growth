import { redirect } from "next/navigation";
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import {
  brandTable,
  channelTable,
  memberTable,
  mixTargetTable,
} from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { getBrandStrategy } from "@/server/services/cadence.service";
import { ChannelsClient, type BrandChannels } from "./ChannelsClient";

const WINDOW_DAYS = 28;

/**
 * /channels — channel × brand legibility: each owned channel's voice
 * fingerprint, its observed publishing cadence (last 4 weeks) vs its
 * cadence_target, and each brand's pillar content mix vs its mix_target. The
 * "are we executing the strategy?" view.
 *
 * The cadence/mix math is the shared cadence.service (same source as
 * /brands/[slug]); this page layers the voice fingerprint on top.
 */
export default async function ChannelsPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  const { brand } = await searchParams;
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization;
  if (!org) {
    return (
      <div className="p-8 text-muted-foreground">No organization found.</div>
    );
  }

  const brands = await db.query.brandTable.findMany({
    where: and(
      eq(brandTable.organizationId, org.id),
      brand ? eq(brandTable.id, brand) : undefined,
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true, name: true },
  });
  if (!brands.length) {
    return <ChannelsClient brands={[]} windowDays={WINDOW_DAYS} />;
  }

  // Voice fingerprints — the one thing the strategy service doesn't carry.
  const channelRows = await db.query.channelTable.findMany({
    where: inArray(
      channelTable.brandId,
      brands.map((b) => b.id),
    ),
    columns: {
      id: true,
      channelFingerprint: true,
      profileImageUrl: true,
      bannerImageUrl: true,
      profileUrl: true,
      manageUrl: true,
      connectionStatus: true,
    },
  });
  const fingerprintById = new Map(
    channelRows.map((c) => [
      c.id,
      c.channelFingerprint?.fingerprintText ?? null,
    ]),
  );
  const profileImageById = new Map(
    channelRows.map((channel) => [channel.id, channel.profileImageUrl]),
  );
  const channelDetailsById = new Map(
    channelRows.map((channel) => [channel.id, channel]),
  );

  // Per-channel mix OVERRIDES (channelId set) — the brand default (channelId
  // null) already flows through getBrandStrategy's mix rows. These drive the
  // slot generator's pillar allocation, so they deserve visibility here.
  const overrideRows = await db.query.mixTargetTable.findMany({
    where: and(
      inArray(
        mixTargetTable.brandId,
        brands.map((b) => b.id),
      ),
      isNotNull(mixTargetTable.channelId),
      eq(mixTargetTable.isActive, true),
    ),
    columns: { channelId: true, pillar: true, targetPct: true },
  });
  const mixByChannel = new Map<
    string,
    { pillar: string; targetPct: number }[]
  >();
  for (const r of overrideRows) {
    if (!r.channelId) continue;
    const list = mixByChannel.get(r.channelId) ?? [];
    list.push({ pillar: r.pillar, targetPct: r.targetPct });
    mixByChannel.set(r.channelId, list);
  }
  for (const list of mixByChannel.values())
    list.sort((a, b) => b.targetPct - a.targetPct);

  const data: BrandChannels[] = await Promise.all(
    brands.map(async (b) => {
      const s = await getBrandStrategy(b.id, { windowDays: WINDOW_DAYS });
      return {
        id: b.id,
        name: b.name,
        mixTotal: s.mixTotal,
        mixRows: s.mix.map((m) => ({
          pillar: m.pillar,
          count: m.count,
          pct: m.pct,
          targetPct: m.targetPct,
        })),
        channels: s.channels.map((c) => {
          const details = channelDetailsById.get(c.channelId);
          return {
            id: c.channelId,
            platform: c.platform,
            handle: c.handle,
            profileImageUrl: profileImageById.get(c.channelId) ?? null,
            bannerImageUrl: details?.bannerImageUrl ?? null,
            profileUrl: details?.profileUrl ?? null,
            manageUrl: details?.manageUrl ?? null,
            connectionStatus: details?.connectionStatus ?? "disconnected",
            followerCount: c.followerCount,
            fingerprint: fingerprintById.get(c.channelId) ?? null,
            mixTargets: mixByChannel.get(c.channelId) ?? [],
            postsInWindow: c.postsInWindow,
            archetypes: c.archetypes.map((a) => ({
              archetype: a.archetype,
              perWeek: a.observedPerWeek,
              target: a.target,
            })),
          };
        }),
      };
    }),
  );

  return <ChannelsClient brands={data} windowDays={WINDOW_DAYS} />;
}
