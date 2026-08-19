import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";

import { getSession } from "@/server/better-auth/server";
import { db } from "@/server/db";
import { brandTable, memberTable } from "@/server/db/schema";
import { CompositionsPage } from "./CompositionsPage";

export default async function CompositionsRoute() {
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
    where: and(
      eq(brandTable.organizationId, org.id),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true, name: true, logo: true },
    orderBy: (brand, { asc }) => [asc(brand.name)],
  });

  if (brands.length === 0) {
    return (
      <div className="text-muted-foreground">
        Create a brand first to start building compositions.
      </div>
    );
  }

  return <CompositionsPage brands={brands} />;
}
