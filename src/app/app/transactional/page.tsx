import { redirect } from "next/navigation";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import {
  brandTable,
  memberTable,
  transactionalMessageTable,
} from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { TransactionalRegistry } from "./TransactionalRegistry";

export const metadata = { title: "Transactional · Wander Growth" };

export default async function TransactionalPage() {
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
    columns: { id: true },
  });
  const brandIds = brands.map((b) => b.id);

  const messages = brandIds.length
    ? await db.query.transactionalMessageTable.findMany({
        where: and(
          inArray(transactionalMessageTable.brandId, brandIds),
          isNull(transactionalMessageTable.deletedAt),
        ),
        with: {
          brand: { columns: { id: true, name: true, slug: true } },
        },
        orderBy: (t, { asc }) => [asc(t.domain), asc(t.key)],
      })
    : [];

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <h1 className="text-2xl font-semibold">Transactional</h1>
      <p className="text-muted-foreground mt-1 max-w-3xl text-sm">
        The registry of product-triggered emails the backend owes users — what
        fires each one, where its template lives, and how far along the
        CIO-legacy → react-email → in-house migration it is. Growth never sends
        these; the code is the system of record. Boundary rules in{" "}
        <span className="font-mono text-xs">docs/transactional-emails.md</span>.
      </p>
      <TransactionalRegistry initialMessages={messages} />
    </div>
  );
}
