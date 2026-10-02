import type { ReactNode } from "react";
import { CheckCircle2, CircleDashed } from "lucide-react";
import { desc, eq } from "drizzle-orm";

import { Badge } from "@/components/ui/badge";
import { db } from "@/server/db";
import { homeTable, performanceIntakeTable } from "@/server/db/schema";

import { IntakeAnswers, type IntakeHome } from "../../IntakeAnswers";
import { SendLink } from "../../SendLink";
import { IntakeActions } from "./IntakeActions";
import { ReviewIntakeInChat } from "./ReviewIntakeInChat";

const dateOf = (date: Date) =>
  date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/** What the client told us on the intake form, newest first. */
export async function SubmissionSection({
  brand,
  pitchUrl,
  intakeUrl,
}: {
  brand: { id: string; name: string; slug: string | null };
  pitchUrl: string | null;
  intakeUrl: string | null;
}) {
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
  const [latest, ...earlier] = intakes;

  return (
    <section
      id="submission"
      className="scroll-mt-6 space-y-4 rounded-xl border bg-card p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">
          Submission
          {latest ? ` · ${dateOf(latest.submittedAt)}` : ""}
        </h3>
        <div className="flex flex-wrap items-center gap-1.5">
          {pitchUrl ? <SendLink label="Pitch page" url={pitchUrl} /> : null}
          {intakeUrl ? <SendLink label="Intake form" url={intakeUrl} /> : null}
        </div>
      </div>

      {latest ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={latest.status === "applied" ? "default" : "outline"}
            >
              {latest.status}
            </Badge>
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <Signal ok={Boolean(latest.accessClaimedAt)}>
                Access claimed
              </Signal>
              <Signal ok={Boolean(latest.zernioVerifiedAt)}>
                Verified in Zernio
              </Signal>
            </p>
            {latest.status !== "applied" && (
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <ReviewIntakeInChat
                  brandId={brand.id}
                  brandName={brand.name}
                  intakeId={latest.id}
                />
                <IntakeActions
                  intakeId={latest.id}
                  verified={Boolean(latest.zernioVerifiedAt)}
                />
              </div>
            )}
          </div>
          <IntakeAnswers answers={latest.answers} homes={homeByUrl} />
          {earlier.map((intake) => (
            <details key={intake.id} className="group space-y-3">
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                Earlier: {dateOf(intake.submittedAt)} · {intake.status}
              </summary>
              <IntakeAnswers answers={intake.answers} homes={homeByUrl} />
            </details>
          ))}
        </>
      ) : (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-xs text-muted-foreground">
          No submission yet.
        </p>
      )}
    </section>
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
