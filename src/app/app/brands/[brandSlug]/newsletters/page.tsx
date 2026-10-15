import { notFound, redirect } from "next/navigation";
import { and, eq, isNull, or } from "drizzle-orm";

import { db } from "@/server/db";
import { brandTable } from "@/server/db/schema";
import { workspaceActor } from "@/server/workspace-actor";

import { NewslettersView } from "@/app/app/newsletters/NewslettersView";

export const dynamic = "force-dynamic";

/**
 * /app/brands/[brandSlug]/newsletters — one brand's newsletters, beside its
 * content and campaigns. The brand comes from the path, so planning an issue
 * here never has to guess which brand it is for.
 */
export default async function BrandNewslettersPage({
  params,
  searchParams,
}: {
  params: Promise<{ brandSlug: string }>;
  searchParams: Promise<{ kind?: string; view?: string }>;
}) {
  const actor = await workspaceActor();
  if (!actor) redirect("/signin");
  const [{ brandSlug }, { kind, view }] = await Promise.all([
    params,
    searchParams,
  ]);
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.organizationId, actor.orgId),
      or(eq(brandTable.slug, brandSlug), eq(brandTable.id, brandSlug)),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true, name: true, slug: true },
  });
  if (!brand) notFound();

  return (
    <div>
      <NewslettersView
        brands={[brand]}
        brand={brand}
        basePath={`/app/brands/${brand.slug ?? brand.id}/newsletters`}
        kindFilter={kind}
        view={view === "wall" || view === "read" ? view : "list"}
      />
    </div>
  );
}
