import { redirect } from "next/navigation";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { brandTable, contentPostTable, memberTable } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { PILLARS } from "@/lib/pillars";

export default async function PillarsPage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization;
  if (!org) {
    return <div className="text-muted-foreground p-8">No organization found.</div>;
  }

  const brands = await db.query.brandTable.findMany({
    where: and(eq(brandTable.organizationId, org.id), isNull(brandTable.deletedAt)),
  });
  const brandIds = brands.map((b) => b.id);

  const posts = brandIds.length
    ? await db.query.contentPostTable.findMany({
        where: inArray(contentPostTable.brandId, brandIds),
        columns: { pillar: true },
      })
    : [];

  const countByPillar = new Map<string, number>();
  for (const p of posts) {
    if (p.pillar) countByPillar.set(p.pillar, (countByPillar.get(p.pillar) ?? 0) + 1);
  }

  // Only show brands that have pillars defined in the registry.
  const brandsWithPillars = brands
    .map((b) => ({ brand: b, pillars: PILLARS.filter((p) => p.brandSlug === b.slug) }))
    .filter((x) => x.pillars.length > 0);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Pillars</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Content pillars &amp; strategy — the themes each brand publishes against.
      </p>

      {brandsWithPillars.map(({ brand, pillars }) => (
        <section key={brand.id} className="mt-8">
          <div className="mb-3 flex items-center gap-2">
            <div className="bg-muted text-foreground flex size-6 items-center justify-center rounded-md text-[10px] font-semibold">
              {brand.name.slice(0, 2)}
            </div>
            <h2 className="text-sm font-semibold">{brand.name}</h2>
            <span className="text-muted-foreground text-xs">
              · {pillars.length} pillars
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {pillars.map((p) => {
              const count = countByPillar.get(p.slug) ?? 0;
              return (
                <div
                  key={p.slug}
                  className="bg-card relative overflow-hidden rounded-xl border p-4"
                >
                  <span
                    className="absolute inset-y-0 left-0 w-1"
                    style={{ background: p.color }}
                  />
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2 rounded-full"
                      style={{ background: p.color }}
                    />
                    <span className="text-sm font-semibold">{p.name}</span>
                    <span className="flex-1" />
                    <span className="text-muted-foreground text-[11px] tabular-nums">
                      {count} post{count === 1 ? "" : "s"}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">
                    {p.description}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <p className="text-muted-foreground mt-8 text-[11px]">
        Pillars are defined in code for now (view-only). Posts are tagged to a
        pillar via the content editor; counts update live.
      </p>
    </div>
  );
}
