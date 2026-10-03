import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { PitchChatButton } from "../PitchChatButton";
import { plausibleWanderOsId } from "@/lib/wanderos-site-detection";
import { SiteTag } from "../SiteTag";
import { and, desc, eq, ilike, isNull, or, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { brandTable, brandPitchTable } from "@/server/db/schema";
import { brandPitchUrl } from "@/server/services/brand-connect.service";
import { workspaceActor } from "@/server/workspace-actor";
import { PitchSearch } from "./PitchSearch";
import { ProspectSearch } from "../prospects/ProspectSearch";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pitch desk · Wander Performance" };

export default async function PitchDesk({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const actor = await workspaceActor();
  if (!actor) redirect("/signin");
  const { q = "" } = await searchParams;
  const term = (Array.isArray(q) ? (q[0] ?? "") : q).trim().slice(0, 160);
  const pattern = `%${term.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
  const brands = await db.query.brandTable.findMany({
    where: and(
      eq(brandTable.organizationId, actor.orgId),
      isNull(brandTable.deletedAt),
      or(
        eq(brandTable.relationship, "prospect"),
        eq(brandTable.relationship, "client"),
      ),
      term
        ? or(
            ilike(brandTable.name, pattern),
            ilike(brandTable.website, pattern),
          )
        : undefined,
    ),
    columns: {
      id: true,
      name: true,
      slug: true,
      website: true,

      wanderOsWebsiteId: true,
    },
    orderBy: desc(brandTable.updatedAt),
    limit: 12,
  });
  const pitches = brands.length
    ? await db.query.brandPitchTable.findMany({
        where: inArray(
          brandPitchTable.brandId,
          brands.map((brand) => brand.id),
        ),
        columns: { brandId: true },
      })
    : [];
  const customized = new Set(pitches.map((pitch) => pitch.brandId));
  return (
    <div className="mx-auto max-w-3xl space-y-7 py-8">
      <div className="space-y-2 text-center">
        <h2 className="text-3xl font-semibold tracking-tight">
          Who are you pitching?
        </h2>
        <p className="text-muted-foreground">
          Find a prospect, shape their pitch, and share the link.
        </p>
      </div>
      <PitchSearch term={term}>
        <section className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">
            {term ? "In Growth" : "Recently updated prospects & clients"}
          </h3>
          <ul className="divide-y rounded-2xl border bg-card">
            {brands.map((brand) => (
              <li
                key={brand.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
              >
                <div className="min-w-0">
                  <Link
                    className="font-medium hover:underline"
                    href={`/app/performance/brands/${brand.slug ?? brand.id}/pitch`}
                  >
                    {brand.name}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <SiteTag website={brand.website} />
                    {plausibleWanderOsId(brand.wanderOsWebsiteId) && (
                      <Badge variant="secondary">WanderOS</Badge>
                    )}
                  </div>
                  {customized.has(brand.id) && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Customized pitch
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-4">
                  <PitchChatButton brandId={brand.id} name={brand.name} />
                  <Link
                    className="text-sm hover:underline"
                    href={`/app/performance/brands/${brand.slug ?? brand.id}/pitch`}
                  >
                    Edit pitch
                  </Link>
                  {brand.slug && (
                    <a
                      className="text-sm font-medium hover:underline"
                      href={brandPitchUrl(brand.slug)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View pitch ↗
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {!brands.length && (
            <p className="text-sm text-muted-foreground">
              No matching prospect yet. Pick a lead below to create their pitch
              workspace.
            </p>
          )}
        </section>
        {term.length >= 2 && (
          <section className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">
              More leads · includes mirrored HubSpot companies
            </h3>
            <ProspectSearch
              key={term}
              initialQuery={term}
              hideInput
              pitchMode
              pitchBrands={brands}
              prospectDomains={brands.map(
                (brand) =>
                  brand.website
                    ?.replace(/^https?:\/\//, "")
                    .replace(/\/$/, "") ?? "",
              )}
            />
          </section>
        )}
      </PitchSearch>
    </div>
  );
}
