import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { Building2, ExternalLink } from "lucide-react";

import { db } from "@/server/db";
import { memberTable } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { EmptyState } from "@/components/ui/empty-state";
import { loadPerformanceDesk } from "@/server/services/performance-desk.service";

import { brandAdsHref, BrandLogo, StateChip } from "../_components";
import { NewClientBox } from "../NewClientBox";

export const metadata: Metadata = { title: "Clients · Wander Performance" };
export const dynamic = "force-dynamic";

/**
 * The clients, one card each: who they are, whether the brand is ready to
 * render (a mark), and how far their campaigns have got. The full brand page
 * is one click away; this is the list a client manager scans.
 */
export default async function PerformanceClientsPage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");
  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization;
  if (!org) return <div className="text-muted-foreground">No organization found.</div>;

  const desk = await loadPerformanceDesk(org.id);
  const clients = desk.brands.filter((brand) => brand.relationship !== "internal");
  const internal = desk.brands.filter((brand) => brand.relationship === "internal");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {clients.length} client{clients.length === 1 ? "" : "s"} and prospects.
        </p>
        <NewClientBox />
      </div>

      {clients.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No clients yet"
          description="Paste a website above and the assistant sets the brand up and drafts its first ads."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((brand) => (
            <li key={brand.id} className="bg-card flex flex-col gap-3 rounded-xl border p-4">
              <div className="flex items-center gap-3">
                <BrandLogo brand={brand} className="size-10" />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/app/brands/${brand.slug ?? brand.id}`}
                    className="block truncate text-sm font-semibold hover:underline"
                  >
                    {brand.name}
                  </Link>
                  <div className="text-muted-foreground flex items-center gap-2 text-[11px]">
                    <span className="capitalize">{brand.relationship}</span>
                    {brand.account ? <span className="capitalize">· {brand.account.status}</span> : null}
                  </div>
                </div>
                {brand.best ? <StateChip state={brand.best} /> : null}
              </div>
              {brand.website ? (
                <a
                  href={brand.website}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground inline-flex items-center gap-1 truncate text-xs hover:underline"
                >
                  {brand.website.replace(/^https?:\/\//, "")}
                  <ExternalLink className="size-3" />
                </a>
              ) : null}
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-muted-foreground">Campaigns</dt>
                  <dd className="font-medium">{brand.campaigns.length || "None yet"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Brand mark</dt>
                  <dd className={brand.hasMark ? "font-medium" : "text-amber-300"}>
                    {brand.hasMark ? "Set" : "Missing"}
                  </dd>
                </div>
              </dl>
              <div className="mt-auto flex items-center gap-3 text-xs">
                <Link href={brandAdsHref(brand)} className="font-medium hover:underline">
                  {brand.campaigns.length === 0 ? "Start a campaign" : "Open campaigns"}
                </Link>
                {brand.account ? (
                  <Link href={`/app/performance/${brand.account.id}`} className="text-muted-foreground hover:underline">
                    Account
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {internal.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Wander&apos;s own
          </h2>
          <ul className="bg-card divide-y rounded-xl border">
            {internal.map((brand) => (
              <li key={brand.id} className="flex items-center gap-3 px-4 py-2.5">
                <BrandLogo brand={brand} className="size-6" />
                <Link href={brandAdsHref(brand)} className="min-w-0 flex-1 truncate text-sm hover:underline">
                  {brand.name}
                </Link>
                <span className="text-muted-foreground text-xs">
                  {brand.campaigns.length} campaign{brand.campaigns.length === 1 ? "" : "s"}
                </span>
                {brand.best ? <StateChip state={brand.best} /> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
