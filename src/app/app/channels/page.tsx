import { redirect } from "next/navigation";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { brandTable, channelTable, memberTable } from "@/server/db/schema";
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
export default async function ChannelsPage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization;
  if (!org) {
    return <div className="text-muted-foreground p-8">No organization found.</div>;
  }

  const brands = await db.query.brandTable.findMany({
    where: and(eq(brandTable.organizationId, org.id), isNull(brandTable.deletedAt)),
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
    columns: { id: true, channelFingerprint: true },
  });
  const fingerprintById = new Map(
    channelRows.map((c) => [c.id, c.channelFingerprint?.fingerprintText ?? null]),
  );

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
        channels: s.channels.map((c) => ({
          id: c.channelId,
          platform: c.platform,
          handle: c.handle,
          followerCount: c.followerCount,
          fingerprint: fingerprintById.get(c.channelId) ?? null,
          postsInWindow: c.postsInWindow,
          archetypes: c.archetypes.map((a) => ({
            archetype: a.archetype,
            perWeek: a.observedPerWeek,
            target: a.target,
          })),
        })),
      };
    }),
  );

  return <ChannelsClient brands={data} windowDays={WINDOW_DAYS} />;
}
