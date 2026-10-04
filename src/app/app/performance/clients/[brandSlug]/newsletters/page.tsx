import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { EmailAudiencesClient } from "@/app/app/newsletters/audiences/EmailAudiencesClient";
import { NewslettersView } from "@/app/app/newsletters/NewslettersView";

import { loadPerformanceBrand } from "../_data";
import { db } from "@/server/db";
import { brandTable } from "@/server/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { suggestedEmailRoot } from "@/lib/email-dns";
import { EmailDnsSetup } from "./EmailDnsSetup";

export const metadata: Metadata = { title: "Email · Wander Performance" };
export const dynamic = "force-dynamic";

export default async function PerformanceBrandNewslettersPage({
  params,
  searchParams,
}: {
  params: Promise<{ brandSlug: string }>;
  searchParams: Promise<{ kind?: string; view?: string }>;
}) {
  const [{ brandSlug }, { kind, view }] = await Promise.all([
    params,
    searchParams,
  ]);
  const { session, org, brand } = await loadPerformanceBrand(brandSlug);
  if (!session) redirect("/signin");
  if (!org)
    return <div className="text-muted-foreground">No organization found.</div>;
  if (!brand) notFound();

  const slug = brand.slug ?? brand.id;
  const sender = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, brand.id),
      eq(brandTable.organizationId, org.id),
      isNull(brandTable.deletedAt),
    ),
    columns: { emailSender: true, wanderOsWebsiteId: true },
  });
  const setup = sender?.emailSender?.marketingDomain;
  return (
    <div className="space-y-6">
      <EmailDnsSetup
        brandId={brand.id}
        rootDomain={setup?.rootDomain ?? suggestedEmailRoot(brand.website)}
        sendingDomain={setup?.sendingDomain}
      />
      <NewslettersView
        brands={[{ id: brand.id, name: brand.name, slug: brand.slug }]}
        brand={{ id: brand.id, name: brand.name, slug: brand.slug }}
        basePath={`/app/performance/clients/${slug}/newsletters`}
        kindFilter={kind}
        view={view === "wall" || view === "read" ? view : "list"}
      />
      <EmailAudiencesClient
        key={brand.id}
        embedded
        brands={[
          {
            id: brand.id,
            name: brand.name,
            slug: brand.slug,
            wanderOsWebsiteId: sender?.wanderOsWebsiteId ?? null,
          },
        ]}
      />
    </div>
  );
}
