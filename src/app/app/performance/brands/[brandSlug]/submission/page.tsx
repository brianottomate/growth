import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CheckCircle2, CircleDashed } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";

import { Badge } from "@/components/ui/badge";
import { db } from "@/server/db";
import { homeTable, performanceIntakeTable } from "@/server/db/schema";

import { SectionLabel } from "../../../_components";
import { IntakeAnswers, type IntakeHome } from "../../../IntakeAnswers";
import { loadPerformanceBrand } from "../_data";
import { ReviewIntakeInChat } from "./ReviewIntakeInChat";

export const metadata: Metadata = { title: "Submission · Wander Performance" };
export const dynamic = "force-dynamic";

const dateOf = (date: Date) =>
  date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/** What the client told us on the intake form, newest first. */
export default async function PerformanceBrandSubmissionPage({
  params,
}: {
  params: Promise<{ brandSlug: string }>;
}) {
  const { brandSlug } = await params;
  const { session, org, brand, deskBrand } =
    await loadPerformanceBrand(brandSlug);
  if (!session) redirect("/signin");
  if (!org)
    return <div className="text-muted-foreground">No organization found.</div>;
  if (!brand) notFound();

  const [intakes, homes] = await Promise.all([
    db.query.performanceIntakeTable.findMany({
      where: eq(performanceIntakeTable.brandId, brand.id),
      orderBy: desc(performanceIntakeTable.submittedAt),
      columns: {
        id: true,
        status: true,
        submittedAt: true,
        answers: true,
        accessClaimedAt: true,
        zernioVerifiedAt: true,
      },
    }),
    db.query.homeTable.findMany({
      where: eq(homeTable.brandId, brand.id),
      columns: {
        urlKey: true,
        name: true,
        externalId: true,
        heroSourceUrl: true,
        galleryCache: true,
      },
    }),
  ]);
  const slug = brand.slug ?? brand.id;
  const homeByUrl: Record<string, IntakeHome> = Object.fromEntries(
    homes.map((home) => [
      home.urlKey,
      {
        name: home.name,
        thumbUrl: home.galleryCache?.[0]?.thumbUrl ?? home.heroSourceUrl,
        href: `/app/performance/brands/${slug}/homes/${home.externalId}`,
      },
    ]),
  );

  if (intakes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No submission yet.
        {deskBrand?.intakeUrl && (
          <>
            {" "}
            <a
              href={deskBrand.intakeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Open intake form
            </a>
          </>
        )}
      </p>
    );
  }

  const [latest, ...earlier] = intakes;
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold">
            Submitted {dateOf(latest!.submittedAt)}
          </h2>
          <Badge variant={latest!.status === "applied" ? "default" : "outline"}>
            {latest!.status}
          </Badge>
          {latest!.status !== "applied" && (
            <div className="ml-auto">
              <ReviewIntakeInChat
                brandId={brand.id}
                brandName={brand.name}
                intakeId={latest!.id}
              />
            </div>
          )}
        </div>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <Signal ok={Boolean(latest!.accessClaimedAt)}>Access claimed</Signal>
          <Signal ok={Boolean(latest!.zernioVerifiedAt)}>
            Verified in Zernio
          </Signal>
        </p>
        <IntakeAnswers answers={latest!.answers} homes={homeByUrl} />
      </section>

      {earlier.length > 0 && (
        <section className="space-y-3">
          <SectionLabel>Earlier submissions</SectionLabel>
          {earlier.map((intake) => (
            <details key={intake.id} className="group space-y-3">
              <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                {dateOf(intake.submittedAt)} · {intake.status}
              </summary>
              <IntakeAnswers answers={intake.answers} homes={homeByUrl} />
            </details>
          ))}
        </section>
      )}
    </div>
  );
}

function Signal({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      {ok ? (
        <CheckCircle2 aria-hidden="true" className="size-3 text-primary" />
      ) : (
        <CircleDashed aria-hidden="true" className="size-3" />
      )}
      <span className="sr-only">{ok ? "Confirmed: " : "Not confirmed: "}</span>
      {children}
    </span>
  );
}
