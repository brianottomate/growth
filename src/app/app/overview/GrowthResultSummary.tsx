"use client";
import { EmailResultPreview } from "./EmailResultPreview";
import Link from "next/link";
import { growthResultSummary } from "@/lib/growth-result-summary";

export function GrowthResultSummary({
  kind,
  result,
}: {
  kind: string;
  result: unknown;
}) {
  if (kind === "email") return <EmailResultPreview result={result} />;
  const summary = growthResultSummary(kind, result);
  return (
    <section
      aria-label={summary.title}
      className="space-y-3 rounded-xl border bg-card p-3 text-xs"
    >
      {(kind !== "brands" || summary.rows.length === 0) && (
        <div>
          <h3 className="font-semibold">{summary.title}</h3>
          <p className="mt-1 text-muted-foreground">{summary.description}</p>
        </div>
      )}
      {summary.facts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {summary.facts.map((fact) => (
            <span key={fact} className="rounded-md bg-muted px-2 py-1">
              {fact}
            </span>
          ))}
        </div>
      )}
      {summary.rows.map((row, index) => (
        <article
          key={index}
          className={
            kind === "creative"
              ? "min-w-0 space-y-2"
              : "flex min-w-0 items-start gap-3"
          }
        >
          {row.thumbnail && (
            <img
              src={row.thumbnail}
              alt={row.title}
              // A creative is the composition itself, so it gets the card's
              // width; everything else is a thumbnail beside its line.
              className={
                kind === "creative"
                  ? "aspect-square w-full max-w-[360px] rounded-xl border bg-muted object-cover"
                  : "size-12 shrink-0 rounded-lg object-cover"
              }
              loading="lazy"
            />
          )}
          <div className="min-w-0 flex-1">
            {kind === "brands" && row.href ? (
              <Link
                href={row.href}
                className="line-clamp-2 font-medium hover:underline"
              >
                {row.title}
              </Link>
            ) : (
              <p className="line-clamp-2 font-medium">{row.title}</p>
            )}
            {row.detail && (
              <p className="mt-1 line-clamp-2 text-muted-foreground">
                {row.detail}
              </p>
            )}
            {row.href && kind !== "brands" && (
              <Link
                href={row.href}
                className="mt-1 inline-block underline underline-offset-2"
              >
                View content
              </Link>
            )}
          </div>
        </article>
      ))}
      {summary.note && <p className="text-muted-foreground">{summary.note}</p>}
      {(kind !== "brands" || summary.rows.length === 0 || summary.note) && (
        <Link
          href={summary.href}
          className="inline-block underline underline-offset-2"
        >
          {summary.linkLabel}
        </Link>
      )}
    </section>
  );
}
