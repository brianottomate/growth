import { notFound, redirect } from "next/navigation";
import { and, eq, isNull, or } from "drizzle-orm";

import { HydrateClient, orpc, prefetch } from "@/orpc/server";
import { db } from "@/server/db";
import { brandTable } from "@/server/db/schema";
import { workspaceActor } from "@/server/workspace-actor";

import { InitiativesClient } from "@/app/app/initiatives/InitiativesClient";

export const dynamic = "force-dynamic";

/**
 * /app/brands/[brandSlug]/initiatives: the initiatives this brand leads or
 * takes part in, beside its content and campaigns. The same list as
 * /app/initiatives, narrowed to the brand in the path, so a push that spans
 * brands still shows up on each brand it touches.
 */
export default async function BrandInitiativesPage({
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
    columns: { id: true, name: true },
  });
  if (!brand) notFound();

  prefetch(orpc.initiative.list.queryOptions({ input: { brandId: brand.id } }));
  return (
    <HydrateClient>
      <InitiativesClient brand={brand} />
    </HydrateClient>
  );
}
