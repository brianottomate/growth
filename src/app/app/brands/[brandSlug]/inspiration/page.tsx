import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/server/db";
import {
  brandInspirationTable,
  brandTable,
  channelTable,
} from "@/server/db/schema";
import { workspaceActor } from "@/server/workspace-actor";
import { InspirationWorkspace } from "./InspirationWorkspace";

export const metadata: Metadata = { title: "Inspiration · Wander Growth" };
export const dynamic = "force-dynamic";

export default async function InspirationPage({
  params,
}: {
  params: Promise<{ brandSlug: string }>;
}) {
  const actor = await workspaceActor();
  if (!actor) redirect("/signin");
  const { brandSlug } = await params;
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.organizationId, actor.orgId),
      or(eq(brandTable.slug, brandSlug), eq(brandTable.id, brandSlug)),
      isNull(brandTable.deletedAt),
    ),
    columns: {
      id: true,
      name: true,
      logo: true,
      description: true,
      website: true,
    },
  });
  if (!brand) notFound();
  const links = await db.query.brandInspirationTable.findMany({
    where: eq(brandInspirationTable.brandId, brand.id),
    with: { inspirationBrand: true },
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });
  const visible = links.filter(
    (link) => link.inspirationBrand && !link.inspirationBrand.deletedAt,
  );
  const channels = await db.query.channelTable.findMany({
    where: and(
      inArray(channelTable.brandId, [
        brand.id,
        ...visible.map((link) => link.inspirationBrandId),
      ]),
      eq(channelTable.platform, "instagram"),
      isNull(channelTable.deletedAt),
    ),
    columns: { brandId: true, profileUrl: true, handle: true },
  });
  const ownChannel = channels.find((item) => item.brandId === brand.id);
  return (
    <InspirationWorkspace
      brandId={brand.id}
      brandName={brand.name}
      ownBrand={{
        ...brand,
        linkId: brand.id,
        isOwn: true,
        purpose: "inspiration",
        instagram:
          ownChannel?.profileUrl ??
          (ownChannel?.handle
            ? `https://www.instagram.com/${ownChannel.handle.replace(/^@/, "")}/`
            : null),
      }}
      brands={visible.map((link) => {
        const peer = link.inspirationBrand;
        const channel = channels.find((item) => item.brandId === peer.id);
        return {
          id: peer.id,
          linkId: link.id,
          name: peer.name,
          logo: peer.logo,
          description: peer.description,
          website: peer.website,
          purpose: link.purpose,
          instagram:
            channel?.profileUrl ??
            (channel?.handle
              ? `https://www.instagram.com/${channel.handle.replace(/^@/, "")}/`
              : null),
        };
      })}
    />
  );
}
