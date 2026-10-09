import { redirect } from "next/navigation";
import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import {
  brandTable,
  brandInspirationTable,
  channelTable,
  platformPostTable,
} from "@/server/db/schema";
import { workspaceActor } from "@/server/workspace-actor";
import { LandscapeBrowser } from "./LandscapeBrowser";

export const dynamic = "force-dynamic";
export default async function LandscapePage() {
  const actor = await workspaceActor();
  if (!actor) redirect("/signin");
  const owned = await db.query.brandTable.findMany({
    where: and(
      eq(brandTable.organizationId, actor.orgId),
      isNull(brandTable.deletedAt),
    ),
  });
  const links = owned.length
    ? await db.query.brandInspirationTable.findMany({
        where: inArray(
          brandInspirationTable.brandId,
          owned.map((b) => b.id),
        ),
        with: { inspirationBrand: true },
      })
    : [];
  const brands = new Map(
    owned.map((b) => [
      b.id,
      { id: b.id, name: b.name, role: "owned", slug: b.slug },
    ]),
  );
  for (const link of links) {
    const b = link.inspirationBrand;
    if (!b.deletedAt && !b.organizationId && !brands.has(b.id))
      brands.set(b.id, {
        id: b.id,
        name: b.name,
        role: link.purpose,
        slug: b.slug,
      });
  }
  const ids = [...brands.keys()];
  const channels = ids.length
    ? await db.query.channelTable.findMany({
        where: and(
          inArray(channelTable.brandId, ids),
          isNull(channelTable.deletedAt),
        ),
      })
    : [];
  const samples = await Promise.all(
    ids.map((brandId) =>
      db.query.platformPostTable.findMany({
        where: and(
          eq(platformPostTable.brandId, brandId),
          eq(platformPostTable.isSeed, false),
          isNotNull(platformPostTable.publishedAt),
        ),
        orderBy: [desc(platformPostTable.publishedAt)],
        limit: 12,
      }),
    ),
  );
  return (
    <LandscapeBrowser
      brands={[...brands.values()]
        .filter(
          (b) =>
            b.role !== "owned" ||
            channels.some(
              (c) =>
                c.brandId === b.id &&
                ["instagram", "facebook", "linkedin", "x"].includes(
                  c.platform,
                ) &&
                c.profileUrl,
            ) ||
            samples.flat().some((p) => p.brandId === b.id),
        )
        .map((b) => ({
          ...b,
          channels: channels
            .filter((c) => c.brandId === b.id)
            .map((c) => ({ platform: c.platform, profileUrl: c.profileUrl })),
          posts: samples
            .flat()
            .filter((p) => p.brandId === b.id)
            .map((p) => ({
              id: p.id,
              text: p.text,
              platform: p.platform,
              externalUrl: p.externalUrl,
              media: p.media ?? [],
              at: p.publishedAt!.toISOString(),
            })),
        }))}
    />
  );
}
