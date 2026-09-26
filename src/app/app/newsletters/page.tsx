import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { brandTable, memberTable } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";

import { NewslettersView } from "./NewslettersView";

/** Every brand's newsletters. One brand's live at /app/brands/[slug]/newsletters. */
export default async function NewslettersPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; view?: string; brand?: string }>;
}) {
  const { kind, view, brand } = await searchParams;
  // The brand filter used to be a query param; its links still work.
  if (brand) {
    const query = new URLSearchParams();
    if (kind) query.set("kind", kind);
    if (view) query.set("view", view);
    redirect(
      `/app/brands/${encodeURIComponent(brand)}/newsletters${query.size ? `?${query}` : ""}`,
    );
  }
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization;
  if (!org)
    return <div className="text-muted-foreground">No organization found.</div>;

  const brands = await db.query.brandTable.findMany({
    where: and(
      eq(brandTable.organizationId, org.id),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true, name: true, slug: true },
  });

  return (
    <NewslettersView
      brands={brands}
      brand={null}
      basePath="/app/newsletters"
      kindFilter={kind}
      view={view === "wall" || view === "read" ? view : "list"}
    />
  );
}
