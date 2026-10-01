import { notFound, redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { getSession } from "@/server/better-auth/server";
import { db } from "@/server/db";
import { brandTable, memberTable } from "@/server/db/schema";
import { HomeGroupsWorkspace } from "./HomeGroupsWorkspace";
export const dynamic = "force-dynamic";
export default async function HomeGroupsPage({
  params,
}: {
  params: Promise<{ brandSlug: string }>;
}) {
  const { brandSlug } = await params;
  const session = await getSession();
  if (!session?.user) redirect("/signin");
  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
  });
  if (!membership) notFound();
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.slug, brandSlug),
      eq(brandTable.organizationId, membership.organizationId),
      isNull(brandTable.deletedAt),
    ),
  });
  if (!brand) notFound();
  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Homes & booking targets</h1>
      <p className="text-sm text-muted-foreground">
        Reusable home groups for {brand.name}. Featured homes is your default
        selection.
      </p>
      <HomeGroupsWorkspace brandId={brand.id} brandSlug={brandSlug} />
    </div>
  );
}
