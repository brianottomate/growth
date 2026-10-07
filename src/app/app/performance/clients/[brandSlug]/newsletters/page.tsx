import Link from "next/link";
import { EmailSequences } from "@/app/app/newsletters/sequences/EmailSequences";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { EmailAudiencesClient } from "@/app/app/newsletters/audiences/EmailAudiencesClient";
import { BrandEmailStyle } from "@/app/app/newsletters/BrandEmailStyle";
import { NewsletterCapture } from "@/app/app/newsletters/NewsletterCapture";
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
  searchParams: Promise<{
    kind?: string;
    view?: string;
    tab?: string;
    sequence?: string;
  }>;
}) {
  const [{ brandSlug }, { kind, view, tab, sequence }] = await Promise.all([
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
  const basePath = `/app/performance/clients/${slug}/newsletters`;
  const activeTab = ["sequences", "audiences", "settings"].includes(tab ?? "")
    ? tab
    : "blasts";
  const audiences = (
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
  );
  const settings = (
    <div className="space-y-6">
      <EmailDnsSetup
        brandId={brand.id}
        rootDomain={setup?.rootDomain ?? suggestedEmailRoot(brand.website)}
        sendingDomain={setup?.sendingDomain}
        styleAction={
          <BrandEmailStyle
            brandId={brand.id}
            brandName={brand.name}
            theme={sender?.emailSender?.theme}
            copyGuide={sender?.emailSender?.copyGuide}
          />
        }
      />
      <NewsletterCapture brands={[brand]} brand={brand} />
    </div>
  );
  return (
    <div className="space-y-6">
      <nav
        aria-label="Email workspace"
        className="flex flex-wrap gap-1 border-b pb-3"
      >
        {(
          [
            ["blasts", "Blasts"],
            ["sequences", "Sequences"],
            ["audiences", "Audiences"],
            ["settings", "Settings"],
          ] as const
        ).map(([key, label]) => (
          <Link
            key={key}
            href={key === "blasts" ? basePath : `${basePath}?tab=${key}`}
            aria-current={activeTab === key ? "page" : undefined}
            className={`rounded-md px-4 py-2 text-sm font-medium ${activeTab === key ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {activeTab === "sequences" ? (
        <EmailSequences
          brandId={brand.id}
          basePath={basePath}
          sequenceId={sequence}
        />
      ) : activeTab === "audiences" ? (
        audiences
      ) : activeTab === "settings" ? (
        settings
      ) : (
        <NewslettersView
          showCapture={false}
          brands={[{ id: brand.id, name: brand.name, slug: brand.slug }]}
          brand={{ id: brand.id, name: brand.name, slug: brand.slug }}
          basePath={basePath}
          kindFilter={kind}
          view={view === "wall" || view === "read" ? view : "list"}
        />
      )}
    </div>
  );
}
