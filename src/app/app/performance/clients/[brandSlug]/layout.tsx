import { WorkspaceBreadcrumbs } from "@/components/workspace-breadcrumbs";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ExternalLink } from "lucide-react";

import { BrandLogo } from "../../_components";
import { Badge } from "@/components/ui/badge";
import { PIPELINE_COLUMNS, pipelineStage } from "@/lib/performance-pipeline";

import { BrandTabs } from "./BrandTabs";
import { loadPerformanceBrand } from "./_data";

/**
 * One client: who they are on one line, then their tabs. Every page under
 * this route is one face of the same brand, so the header and the tabs live
 * here and the pages start at their own content.
 */
export default async function PerformanceBrandLayout({
  params,
  children,
}: {
  params: Promise<{ brandSlug: string }>;
  children: ReactNode;
}) {
  const { brandSlug } = await params;
  const { session, org, brand, deskBrand } =
    await loadPerformanceBrand(brandSlug);
  if (!session) redirect("/signin");
  if (!org)
    return <div className="text-muted-foreground">No organization found.</div>;
  if (!brand) notFound();

  const slug = brand.slug ?? brand.id;
  return (
    <div className="space-y-5">
      <WorkspaceBreadcrumbs
        items={[
          { label: "Performance", href: "/app/performance" },
          { label: "Clients", href: "/app/performance/clients" },
          { label: brand.name },
        ]}
      />
      <div className="flex flex-wrap items-center gap-3">
        <BrandLogo brand={brand} className="size-11 text-sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">
              {brand.name}
            </h2>
            {deskBrand ? (
              <Badge variant="outline" title="Manual client journey">
                {
                  PIPELINE_COLUMNS.find(
                    (column) => column.id === pipelineStage(deskBrand),
                  )?.name
                }
              </Badge>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
            {brand.website ? (
              <a
                href={brand.website}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 hover:underline"
              >
                {brand.website.replace(/^https?:\/\//, "")}
                <ExternalLink className="size-3" />
              </a>
            ) : null}
            <Link href={`/app/brands/${slug}`} className="hover:underline">
              Open brand workspace
            </Link>
            <Link
              href={`/app/brands/${slug}/content`}
              className="hover:underline"
            >
              Content
            </Link>
            <Link
              href={`/app/brands/${slug}/previews`}
              className="hover:underline"
            >
              Organic previews
            </Link>
          </div>
        </div>
      </div>
      <BrandTabs slug={slug} />
      {children}
    </div>
  );
}
