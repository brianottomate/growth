import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq, isNull, or } from "drizzle-orm";

import { db } from "@/server/db";
import { brandTable, memberTable } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { orpc, HydrateClient, prefetch } from "@/orpc/server";

import { ContentBoard } from "@/app/app/content/ContentBoard";

export const dynamic = "force-dynamic";

/**
 * /app/brands/[brandSlug]/content — the content board scoped to one brand.
 * Same board as /app/content with the brand fixed, so a client has one home
 * next to its previews, ads and setup, and "Add idea" never has to guess.
 */
export default async function BrandContentPage({
  params,
  searchParams,
}: {
  params: Promise<{ brandSlug: string }>;
  searchParams?: Promise<{ view?: string }>;
}) {
  const { brandSlug } = await params;
  const sp = (await searchParams) ?? {};
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization;
  if (!org) notFound();

  const brand = await db.query.brandTable.findFirst({
    where: and(
      or(eq(brandTable.slug, brandSlug), eq(brandTable.id, brandSlug)),
      eq(brandTable.organizationId, org.id),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true, name: true, slug: true },
  });
  if (!brand) notFound();

  const initialView =
    sp.view === "schedule" || sp.view === "list" || sp.view === "board"
      ? sp.view
      : undefined;

  prefetch(orpc.content.board.queryOptions({ input: { brandId: brand.id } }));
  prefetch(orpc.content.assignableMembers.queryOptions());

  const slug = brand.slug ?? brandSlug;
  return (
    <HydrateClient>
      <div className="px-6 pt-6">
        <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
          <Link href={`/app/brands/${slug}`} className="hover:underline">
            {brand.name}
          </Link>
          <span>/</span>
          <span className="text-foreground">Content</span>
          <Link
            href={`/app/brands/${slug}/previews`}
            className="ml-auto hover:underline"
          >
            Previews
          </Link>
          <Link href="/app/content" className="hover:underline">
            All brands
          </Link>
        </div>
      </div>
      <ContentBoard
        brands={[{ id: brand.id, name: brand.name, slug: brand.slug }]}
        currentUserId={session.user.id}
        initialBrandId={brand.id}
        initialView={initialView}
        lockedBrandId={brand.id}
      />
    </HydrateClient>
  );
}
