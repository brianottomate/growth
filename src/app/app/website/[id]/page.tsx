import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { ExternalLink } from "lucide-react";

import { ContentAnalysisPanel } from "@/components/content-analysis-panel";
import { SocialSharePreviews } from "@/components/social-share-previews";
import { readContentAnalysis } from "@/lib/content-analysis";
import { PAGE_TYPE_META } from "@/lib/website-pages";
import { getSession } from "@/server/better-auth/server";
import { db } from "@/server/db";
import { memberTable, webPageTable } from "@/server/db/schema";

type WebsiteMetadata = {
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImageWidth?: string | null;
  ogImageHeight?: string | null;
  twitterCard?: string | null;
  twitterTitle?: string | null;
  twitterDescription?: string | null;
  twitterImage?: string | null;
  canonical?: string | null;
  metadataFetchedAt?: string | null;
};

export default async function WebsiteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization;
  if (!org) notFound();

  const page = await db.query.webPageTable.findFirst({
    where: eq(webPageTable.id, id),
    with: { brand: true },
  });
  if (page?.brand?.organizationId !== org.id) notFound();

  const metadata = (page.metadata ?? {}) as WebsiteMetadata;
  const analysis = readContentAnalysis(page.metadata);
  const width = Number(metadata.ogImageWidth);
  const height = Number(metadata.ogImageHeight);
  const dimensionsKnown = width > 0 && height > 0;
  const idealDimensions = width === 1200 && height === 630;
  const backHref = page.brand.slug
    ? `/app/website?brand=${page.brand.slug}`
    : "/app/website";

  const checks = [
    { label: "Title", pass: Boolean(page.title) },
    {
      label: "Description",
      pass: Boolean(page.description),
    },
    { label: "OG title", pass: Boolean(metadata.ogTitle) },
    { label: "OG description", pass: Boolean(metadata.ogDescription) },
    { label: "OG image", pass: Boolean(page.ogImage) },
    { label: "Canonical", pass: Boolean(metadata.canonical) },
    {
      label: dimensionsKnown ? `${width}×${height}` : "Dimensions not declared",
      pass: idealDimensions,
    },
    {
      label: metadata.twitterCard ?? "Twitter card missing",
      pass: metadata.twitterCard === "summary_large_image",
    },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <Link href={backHref} className="hover:text-foreground">
          Website
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">{page.title}</span>
      </div>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span
              className="size-2 rounded-full"
              style={{ background: PAGE_TYPE_META[page.pageType].color }}
            />
            <span className="text-muted-foreground text-xs">
              {PAGE_TYPE_META[page.pageType].label}
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            {metadata.ogTitle ?? page.title}
          </h1>
          {(metadata.ogDescription ?? page.description) && (
            <p className="text-muted-foreground mt-2 max-w-3xl text-sm leading-relaxed">
              {metadata.ogDescription ?? page.description}
            </p>
          )}
        </div>
        <a
          href={page.url}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:bg-accent inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs"
        >
          Open page <ExternalLink className="size-3" />
        </a>
      </div>

      <section className="mt-8">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">OG and share audit</h2>
            <p className="text-muted-foreground mt-1 text-xs">
              The actual metadata and image currently published by the page.
            </p>
          </div>
          {metadata.metadataFetchedAt && (
            <span className="text-muted-foreground text-[10px]">
              Checked {new Date(metadata.metadataFetchedAt).toLocaleString()}
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {checks.map((check) => (
            <span
              key={check.label}
              className={`rounded-full border px-2 py-0.5 text-[10px] ${
                check.pass
                  ? "border-emerald-500/30 text-emerald-500"
                  : "border-amber-500/30 text-amber-500"
              }`}
            >
              {check.pass ? "✓" : "!"} {check.label}
            </span>
          ))}
        </div>

        <div className="mt-5 grid gap-2 md:grid-cols-2">
          <MetadataLine
            label="Title"
            value={page.title}
            compare={metadata.ogTitle}
            compareLabel="OG title"
            max={60}
          />
          <MetadataLine
            label="Description"
            value={page.description}
            compare={metadata.ogDescription}
            compareLabel="OG description"
            max={160}
          />
          <MetadataLine
            label="OG title"
            value={metadata.ogTitle}
            compare={metadata.twitterTitle}
            compareLabel="Twitter title"
            max={60}
          />
          <MetadataLine
            label="OG description"
            value={metadata.ogDescription}
            compare={metadata.twitterDescription}
            compareLabel="Twitter description"
            max={160}
          />
        </div>

        {page.ogImage ? (
          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_240px]">
            <div>
              <p className="text-muted-foreground mb-2 text-[10px] font-semibold tracking-wider uppercase">
                Large card · 1.91:1
              </p>
              <div className="overflow-hidden rounded-xl border bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={page.ogImage}
                  alt=""
                  className="aspect-[40/21] w-full object-cover"
                />
              </div>
            </div>
            <div>
              <p className="text-muted-foreground mb-2 text-[10px] font-semibold tracking-wider uppercase">
                Center crop · 1:1
              </p>
              <div className="overflow-hidden rounded-xl border bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={page.ogImage}
                  alt=""
                  className="aspect-square w-full object-cover"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="text-muted-foreground mt-5 rounded-xl border p-6 text-sm">
            This page does not publish an OG image.
          </div>
        )}

        <div className="mt-8 border-t pt-6">
          <h3 className="text-sm font-semibold">Provider previews</h3>
          <p className="text-muted-foreground mt-1 mb-4 text-xs">
            Representative link cards using the metadata each provider would
            receive. Final rendering remains provider-controlled.
          </p>
          <SocialSharePreviews
            url={page.url}
            title={metadata.ogTitle ?? page.title}
            description={metadata.ogDescription ?? page.description}
            image={page.ogImage}
            twitterTitle={metadata.twitterTitle}
            twitterDescription={metadata.twitterDescription}
            twitterImage={metadata.twitterImage}
          />
        </div>
      </section>

      <ContentAnalysisPanel
        id={page.id}
        kind="website"
        initialAnalysis={analysis}
        sourceUrl={page.url}
      />
    </div>
  );
}

function MetadataLine({
  label,
  value,
  compare,
  compareLabel,
  max,
}: {
  label: string;
  value: string | null | undefined;
  compare: string | null | undefined;
  compareLabel: string;
  max: number;
}) {
  const length = value?.length ?? 0;
  return (
    <div className="bg-muted/30 rounded-lg px-3 py-2.5">
      <div className="text-muted-foreground flex items-center justify-between gap-2 text-[10px] font-semibold tracking-wider uppercase">
        <span>{label}</span>
        <span className={length > max ? "text-red-500" : ""}>
          {length}/{max}
        </span>
      </div>
      <p className="mt-1 text-xs leading-relaxed">{value || "—"}</p>
      {compare && compare !== value && (
        <p className="mt-1 text-[10px] leading-relaxed text-amber-500">
          {compareLabel}: {compare}
        </p>
      )}
    </div>
  );
}
