import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { brandTable, memberTable } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { trpc, HydrateClient, prefetch } from "@/trpc/server";
import { ContentBoard } from "./ContentBoard";

export default async function ContentPage() {
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

  const brands = await db.query.brandTable.findMany({
    where: and(eq(brandTable.organizationId, org.id), isNull(brandTable.deletedAt)),
    columns: { id: true, name: true, slug: true },
  });

  // Initial (unfiltered) board for instant hydration.
  prefetch(trpc.content.board.queryOptions({}));

  return (
    <HydrateClient>
      <div className="mb-3 flex justify-end">
        <Link
          href="/app/content/groupings"
          className="border-border hover:bg-accent rounded-full border px-3 py-1 text-xs font-medium"
        >
          ✨ Suggested groupings
        </Link>
      </div>
      <ContentBoard
        brands={brands.map((b) => ({ id: b.id, name: b.name, slug: b.slug }))}
      />
    </HydrateClient>
  );
}
