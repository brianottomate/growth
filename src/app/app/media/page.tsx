import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { brandTable, memberTable } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { MediaLibrary } from "./MediaLibrary";

export default async function MediaPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  const { brand: requestedBrand } = await searchParams;
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

  // Owned brands only (tracked/reference brands can't hold media).
  const brands = await db.query.brandTable.findMany({
    where: and(
      eq(brandTable.organizationId, org.id),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true, name: true, logo: true, slug: true },
  });

  if (brands.length === 0) {
    return (
      <div className="text-muted-foreground">
        Create a brand first to start a media library.
      </div>
    );
  }

  // ?brand= takes a slug (the linkable form) or an id. An unknown value
  // redirects to the bare page rather than silently showing the first brand
  // under a URL that claims otherwise.
  const requested = requestedBrand
    ? brands.find(
        (row) => row.slug === requestedBrand || row.id === requestedBrand,
      )
    : undefined;
  if (requestedBrand && !requested) redirect("/app/media");

  const initialBrandId = requested?.id ?? null;

  return (
    // Keyed so client-side navigation to a different ?brand= remounts with
    // the right library instead of keeping the mounted state.
    <MediaLibrary
      key={initialBrandId ?? "default"}
      brands={brands}
      initialBrandId={initialBrandId}
    />
  );
}
