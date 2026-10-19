import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { Newspaper, ArrowUpRight } from "lucide-react";
import { db } from "@/server/db";
import {
  seriesTable,
  platformPostTable,
  cadenceTargetTable,
  emailSequenceTable,
  emailSequenceStepTable,
} from "@/server/db/schema";
import { WorkspaceCard } from "@/app/app/performance/WorkspaceCard";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { NewslettersView } from "./NewslettersView";
import {
  NewsletterSeriesActions,
  NewNewsletterEdition,
} from "./NewsletterSeriesActions";
import { NewsletterTemplateStart } from "./NewsletterTemplateStart";
import { NewsletterChatStart } from "./NewsletterChatStart";
import { NewsletterSwitcher } from "./NewsletterSwitcher";
import { EmailClientPreviewLink } from "./EmailClientPreviewLink";
import { NewsletterSeriesPreview } from "./NewsletterSeriesPreview";
import { EMAIL_READ_FORMATS } from "@/lib/email-document";

export async function NewsletterSeriesView({
  brand,
  basePath,
  seriesId,
}: {
  brand: { id: string; name: string; slug: string | null };
  basePath: string;
  seriesId?: string;
}) {
  // The page owns organization access; every relationship stays inside this brand.
  const [series, emails, cadence, steps] = await Promise.all([
    db.query.seriesTable.findMany({
      where: and(
        eq(seriesTable.brandId, brand.id),
        isNull(seriesTable.deletedAt),
      ),
      orderBy: (table, { asc }) => [asc(table.createdAt)],
    }),
    db.query.platformPostTable.findMany({
      where: and(
        eq(platformPostTable.brandId, brand.id),
        eq(platformPostTable.source, "owned"),
        eq(platformPostTable.platform, "newsletter"),
        inArray(platformPostTable.format, [...EMAIL_READ_FORMATS]),
      ),
      with: { contentPost: true },
    }),
    db.query.cadenceTargetTable.findMany({
      where: and(
        eq(cadenceTargetTable.brandId, brand.id),
        eq(cadenceTargetTable.platform, "newsletter"),
        isNull(cadenceTargetTable.deletedAt),
      ),
    }),
    db
      .select({ id: emailSequenceStepTable.platformPostId })
      .from(emailSequenceStepTable)
      .innerJoin(
        emailSequenceTable,
        eq(emailSequenceTable.id, emailSequenceStepTable.sequenceId),
      )
      .where(
        and(
          eq(emailSequenceTable.brandId, brand.id),
          isNull(emailSequenceTable.deletedAt),
        ),
      ),
  ]);
  const sequenceIds = new Set(steps.map((step) => step.id));
  const broadcasts = emails.filter((email) => !sequenceIds.has(email.id));
  const editionsFor = (id: string) =>
    broadcasts.filter((email) => email.contentPost?.seriesId === id);
  const cadenceFor = (id: string) =>
    cadence.filter((target) => target.seriesId === id);
  const cadenceLabel = (id: string) => {
    const targets = cadenceFor(id).filter((target) => target.isActive);
    return targets.length
      ? targets
          .map(
            (target) =>
              `${target.count} ${target.count === 1 ? "edition" : "editions"} / ${target.period}`,
          )
          .join(" · ")
      : "Cadence not set";
  };
  const newsletters = series.filter(
    (item) => editionsFor(item.id).length || cadenceFor(item.id).length,
  );
  const selected = seriesId
    ? series.find((item) => item.id === seriesId)
    : newsletters[0];
  if (seriesId && !selected) notFound();
  if (!selected) {
    return (
      <WorkspaceCard title="Newsletter" icon={Newspaper}>
        <EmptyState
          icon={Newspaper}
          title="Set up your newsletter"
          description="We’ll use your brand story and homes to suggest a direction and draft your first two editions. Shape them together in chat."
          actions={
            <NewsletterChatStart
              brandId={brand.id}
              brandName={brand.name}
              setup
            />
          }
        />
      </WorkspaceCard>
    );
  }
  // Attach content entities: multiple platform renderings can share one idea.
  const available = [
    ...new Map(
      broadcasts
        .filter(
          (email) =>
            email.contentPost &&
            !email.contentPost.seriesId &&
            !["archived", "rejected"].includes(email.status),
        )
        .map((email) => [
          email.contentPost!.id,
          {
            contentPostId: email.contentPost!.id,
            title: email.contentPost!.title || "Untitled email",
          },
        ]),
    ).values(),
  ];
  return (
    <NewslettersView
      key={selected.id}
      brands={[brand]}
      brand={brand}
      basePath={basePath}
      seriesId={selected.id}
      showCapture={false}
      view="list"
      editionTitle={selected.name}
      editionSwitcher={
        newsletters.length > 1 ? (
          <NewsletterSwitcher
            newsletters={newsletters.map((item) => ({
              id: item.id,
              name: item.name,
            }))}
            selectedId={selected.id}
            basePath={basePath}
          />
        ) : undefined
      }
      editionIntro={
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {selected.description ||
              "Shape the recurring promise to your readers in chat."}
          </p>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Badge variant="secondary">{selected.status}</Badge>
            <span className="text-muted-foreground">
              {cadenceLabel(selected.id)}
            </span>
            <Link
              href={`/app/series/${selected.id}`}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              Content series <ArrowUpRight className="size-3" />
            </Link>
            <NewsletterSeriesActions
              brandId={brand.id}
              series={selected}
              available={available}
            />
          </div>
        </div>
      }
      editionActions={
        <>
          <EmailClientPreviewLink
            brandId={brand.id}
            editionIds={editionsFor(selected.id)
              .filter(
                (email) => !["archived", "rejected"].includes(email.status),
              )
              .map((email) => email.id)}
          />
          <NewsletterSeriesPreview
            name={selected.name}
            editions={editionsFor(selected.id)
              .sort(
                (a, b) =>
                  (a.scheduledAt?.getTime() ?? Infinity) -
                    (b.scheduledAt?.getTime() ?? Infinity) ||
                  a.createdAt.getTime() - b.createdAt.getTime(),
              )
              .map((email) => ({
                id: email.id,
                title:
                  email.text || email.contentPost?.title || "Untitled email",
                status: email.status,
                plannedAt: email.scheduledAt?.toISOString() ?? null,
              }))}
          />
          <NewsletterChatStart
            brandId={brand.id}
            brandName={brand.name}
            series={selected}
          />
          <NewsletterTemplateStart brandId={brand.id} seriesId={selected.id} />
          <NewNewsletterEdition brandId={brand.id} seriesId={selected.id} />
        </>
      }
    />
  );
}
