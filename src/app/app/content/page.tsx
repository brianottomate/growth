import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { brandTable, memberTable } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { trpc, HydrateClient, prefetch } from "@/trpc/server";
import { ContentBoard } from "./ContentBoard";

export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; brandId?: string; view?: string }>;
}) {
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization;
  if (!org) {
    return <div className="text-muted-foreground">No organization found.</div>;
  }

  const brands = (
    await db.query.brandTable.findMany({
      where: and(
        eq(brandTable.organizationId, org.id),
        isNull(brandTable.deletedAt),
      ),
      columns: { id: true, name: true, slug: true },
      orderBy: (t, { asc }) => [asc(t.name)],
    })
  )
    // The flagship brand leads — brands[0] is the default target for
    // Add idea / Import plan / Generate slots.
    .sort((a, b) => Number(b.slug === "wander") - Number(a.slug === "wander"));

  const sp = await searchParams;
  const wanted = sp.brand ?? sp.brandId;
  const initialBrandId = brands.find(
    (brand) => brand.slug === wanted || brand.id === wanted,
  )?.id;
  const initialView =
    sp.view === "schedule" || sp.view === "list" || sp.view === "board"
      ? sp.view
      : undefined;

  // Initial board (optionally brand-filtered) + the assignee roster.
  prefetch(trpc.content.board.queryOptions({ brandId: initialBrandId }));
  prefetch(trpc.content.assignableMembers.queryOptions());

  return (
    <HydrateClient>
      <ContentBoard
        brands={brands.map((b) => ({ id: b.id, name: b.name, slug: b.slug }))}
        currentUserId={session.user.id}
        initialBrandId={initialBrandId}
        initialView={initialView}
      />
    </HydrateClient>
  );
}
