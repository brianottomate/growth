import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { brandTable, memberTable } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { LaunchClient } from "./LaunchClient";

export default async function LaunchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

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
    columns: { id: true, name: true },
  });

  const reqBrandId = one(sp.brandId);
  // `img` can repeat (e.g. a Timeline selection of several posts → reference
  // frames), so collect every value rather than just the first.
  const imgs = sp.img ? (Array.isArray(sp.img) ? sp.img : [sp.img]) : undefined;
  const initial = {
    // Only honor a brandId that's actually in this org's list.
    brandId: brands.some((b) => b.id === reqBrandId) ? reqBrandId : undefined,
    name: one(sp.name),
    prompt: one(sp.prompt),
    imageUrls: imgs,
  };

  return (
    <LaunchClient
      brands={brands.map((b) => ({ id: b.id, name: b.name }))}
      initial={initial}
    />
  );
}
