import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { brandTable, memberTable } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { MediaLibrary } from "./MediaLibrary";

export default async function MediaPage() {
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
    columns: { id: true, name: true, logo: true },
  });

  if (brands.length === 0) {
    return (
      <div className="text-muted-foreground">
        Create a brand first to start a media library.
      </div>
    );
  }

  return <MediaLibrary brands={brands} />;
}
