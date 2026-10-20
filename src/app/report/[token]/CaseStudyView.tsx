"use client";

import { Fragment } from "react";
import { Printer } from "lucide-react";
import { Logo } from "@wandercom/design-system-web/ui/logo";

import { EXPORT_HIDE, PngExport } from "@/components/png-export";
import { Button } from "@/components/ui/button";
import {
  caseStudyChange,
  ratio,
  type PerformanceCaseStudy,
  type PerformanceCaseStudyMeasure,
  type PerformanceCaseStudySeries,
} from "@/lib/performance-report";
import { cn } from "@/lib/utils";
import type { PerformanceReportPage } from "@/server/services/performance-report.service";

type Scope = PerformanceCaseStudyMeasure["scope"];

const scopeLabel: Record<Scope, string> = {
  site: "Direct website",
  all_channels: "All booking channels",
  paid: "Paid ads, attributed",
};
const scopeNote: Record<Scope, string> = {
  site: "every visit or booking on the client's own website, whatever brought it",
  all_channels:
    "bookings from every channel in the client's property management system, OTAs included",
  paid: "results the ad platform attributes to the ads",
};

/** Rates are the only raw values a case study shows; they reveal no volume. */
const rate = (value: number) => `${(value * 100).toFixed(1)}%`;

function formatDate(date: string, year = false) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(year ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}
const days = (start: string, end: string) =>
  Math.round(
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
      86_400_000,
  ) + 1;

/** Paragraphs split on blank lines; `**text**` is bold. Nothing else is markup. */
function Prose({ text, className }: { text: string; className?: string }) {
  return text
    .split(/\n\s*\n/)
    .filter((paragraph) => paragraph.trim())
    .map((paragraph, index) => (
      <p
        key={index}
        className={cn("max-w-prose text-[15px] leading-relaxed", className)}
      >
        {paragraph.split(/\*\*(.+?)\*\*/).map((part, i) =>
          i % 2 ? (
            <strong key={i} className="font-semibold">
              {part}
            </strong>
          ) : (
            <Fragment key={i}>{part}</Fragment>
          ),
        )}
      </p>
    ));
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
      {children}
    </div>
  );
}

function Comparison({ study }: { study: PerformanceCaseStudy }) {
  const { before, after } = study.comparison;
  return (
    <div className="rounded-2xl bg-muted/50 p-6 print:break-inside-avoid">
      <Eyebrow>The comparison</Eyebrow>
      <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="h-3 rounded-full bg-neutral-300" />
        <div className="size-3.5 rounded-full bg-neutral-900" />
        <div className="h-3 rounded-full bg-neutral-900" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-6">
        <div>
          <div className="text-lg font-semibold tracking-tight">
            {formatDate(before.startDate)}–{formatDate(before.endDate)}
          </div>
          <div className="text-sm text-muted-foreground">
            {before.label} · {days(before.startDate, before.endDate)} days
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold tracking-tight">
            {formatDate(after.startDate)}–{formatDate(after.endDate)}
          </div>
          <div className="text-sm text-muted-foreground">
            {after.label} · {days(after.startDate, after.endDate)} days
          </div>
        </div>
      </div>
    </div>
  );
}

/** Before = 100 on a zero-based scale, so bar lengths compare honestly. */
function IndexBars({ measures }: { measures: PerformanceCaseStudyMeasure[] }) {
  const indexed = measures.map((measure) => ({
    measure,
    after:
      measure.unit === "percent" || !measure.before
        ? null
        : (measure.after / measure.before) * 100,
  }));
  const max = Math.max(
    150,
    ...indexed.map((row) => Math.ceil((row.after ?? 0) / 50) * 50),
  );
  const width = (value: number) => `${(value / max) * 100}%`;
  return (
    <div className="grid grid-cols-1 gap-6 print:grid-cols-2 print:gap-x-10 print:gap-y-4">
      {indexed.map(({ measure, after }) => (
        <div
          key={`${measure.scope}-${measure.label}`}
          className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px] sm:items-center print:break-inside-avoid print:grid-cols-[1fr_72px] print:gap-2"
        >
          <div className="space-y-1.5">
            <div className="text-[15px] font-semibold">
              {measure.label}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {scopeLabel[measure.scope]}
              </span>
            </div>
            {after === null ? (
              <div className="text-sm text-muted-foreground">
                {rate(measure.before)} → {rate(measure.after)}
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <div
                    className="h-6 rounded-md bg-neutral-300"
                    style={{ width: width(100) }}
                  />
                  <span className="text-sm text-muted-foreground tabular-nums">
                    100
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div
                    className="h-6 rounded-md bg-neutral-900"
                    style={{ width: width(after) }}
                  />
                  <span className="text-sm tabular-nums">
                    {after.toFixed(1)}
                  </span>
                </div>
              </>
            )}
            {measure.note && (
              <p className="text-xs text-muted-foreground">{measure.note}</p>
            )}
          </div>
          <div
            className={cn(
              "text-3xl font-semibold tracking-tight tabular-nums sm:text-right print:text-xl",
              measure.after < measure.before && "text-muted-foreground",
            )}
          >
            {caseStudyChange(measure)}
          </div>
        </div>
      ))}
      <div className="text-xs text-muted-foreground print:col-span-2">
        Index: before = 100, on a zero-based scale.
      </div>
    </div>
  );
}

const CHART_W = 640;
const CHART_H = 220;
const PAD = { top: 18, right: 12, bottom: 34, left: 44 };

/** Weekly bars. Indexed charts divide by the before-window weekly average. */
function SeriesChart({
  series,
  study,
}: {
  series: PerformanceCaseStudySeries;
  study: PerformanceCaseStudy;
}) {
  const { before, after } = study.comparison;
  const baseline = series.points.filter(
    (point) =>
      point.start >= before.startDate &&
      point.start <= before.endDate &&
      !point.partial,
  );
  const base =
    baseline.reduce((sum, point) => sum + point.value, 0) /
    (baseline.length || 1);
  const shown = series.points.map((point) => ({
    ...point,
    shown: base ? (point.value / base) * 100 : point.value,
  }));
  // Round gridlines (0, 50, 100, 150 …) rather than fractions of the peak.
  const peak = Math.max(...shown.map((point) => point.shown), 1);
  const magnitude = 10 ** Math.floor(Math.log10(peak / 3));
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => peak / s <= 4) ??
    10 * magnitude;
  const max = Math.ceil((peak * 1.04) / step) * step;
  const plotW = CHART_W - PAD.left - PAD.right;
  const plotH = CHART_H - PAD.top - PAD.bottom;
  const slot = plotW / shown.length;
  const y = (value: number) => PAD.top + plotH - (value / max) * plotH;
  const first = Date.parse(`${shown[0]!.start}T00:00:00Z`);
  const x = (date: string) =>
    PAD.left +
    ((Date.parse(`${date}T00:00:00Z`) - first) / (7 * 86_400_000)) * slot;
  const ticks = Array.from(
    { length: Math.round(max / step) + 1 },
    (_, i) => i * step,
  );

  return (
    <figure className="rounded-2xl border border-border p-5 print:break-inside-avoid print:p-3">
      <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[15px] font-semibold">{series.label}</span>
        <span className="text-xs text-muted-foreground">
          {scopeLabel[series.scope]}
          {" · before-window weekly average = 100"}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="h-auto w-full"
        role="img"
        aria-label={series.label}
      >
        <rect
          x={x(after.startDate)}
          y={PAD.top}
          width={Math.max(0, PAD.left + plotW - x(after.startDate))}
          height={plotH}
          className="fill-neutral-100"
        />
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={PAD.left + plotW}
              y1={y(tick)}
              y2={y(tick)}
              className="stroke-neutral-200"
            />
            <text
              x={PAD.left - 6}
              y={y(tick) + 4}
              textAnchor="end"
              className="fill-neutral-500 text-[10px]"
            >
              {tick}
            </text>
          </g>
        ))}
        {shown.map((point, index) => {
          const barX = PAD.left + index * slot + slot * 0.18;
          return (
            <g key={point.start}>
              <rect
                x={barX}
                y={y(point.shown)}
                width={slot * 0.64}
                height={PAD.top + plotH - y(point.shown)}
                rx={2}
                className={cn(
                  point.start >= after.startDate
                    ? "fill-neutral-900"
                    : "fill-neutral-400",
                  point.partial && "opacity-40",
                )}
              />
              {(index % Math.ceil(shown.length / 8) === 0 ||
                index === shown.length - 1) && (
                <text
                  x={barX + slot * 0.32}
                  y={CHART_H - 14}
                  textAnchor="middle"
                  className="fill-neutral-500 text-[10px]"
                >
                  {formatDate(point.start)}
                </text>
              )}
            </g>
          );
        })}
        {study.events.map((event) => (
          <g key={event.date + event.label}>
            <line
              x1={x(event.date)}
              x2={x(event.date)}
              y1={PAD.top - 4}
              y2={PAD.top + plotH}
              strokeDasharray="4 3"
              className="stroke-neutral-900"
            />
            <text
              x={x(event.date) + 4}
              y={PAD.top + 6}
              className="fill-neutral-900 text-[10px] font-semibold"
            >
              {event.label}
            </text>
          </g>
        ))}
      </svg>
      {shown.some((point) => point.partial) && (
        <p className="mt-2 text-xs text-muted-foreground">
          Faded weeks are incomplete.
        </p>
      )}
    </figure>
  );
}

type StorySection = PerformanceCaseStudy["sections"][number];

function Story({ section }: { section: StorySection }) {
  return (
    <section className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_minmax(0,320px)] print:break-inside-avoid print:grid-cols-[1fr_190px] print:gap-5">
      <div className="space-y-3">
        <h2 className="text-2xl font-semibold tracking-tight">
          {section.heading}
        </h2>
        <Prose text={section.body} />
      </div>
      {section.imageUrl && (
        <figure className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={section.imageUrl}
            alt={section.imageCaption ?? section.heading}
            className="max-h-96 w-full rounded-xl border border-border object-cover object-top print:max-h-52"
          />
          {section.imageCaption && (
            <figcaption className="text-xs text-muted-foreground">
              {section.imageCaption}
            </figcaption>
          )}
        </figure>
      )}
    </section>
  );
}

export function CaseStudyView({
  token,
  report,
  study,
  controls,
}: {
  token?: string;
  report: PerformanceReportPage;
  study: PerformanceCaseStudy;
  /** Editing controls on the in-app page; never printed. */
  controls?: React.ReactNode;
}) {
  // The first section introduces the client and the program, so it opens the story.
  const [intro, ...rest] = study.sections;
  const measures = study.comparison.measures;
  const featured = measures.filter((measure) => measure.featured);
  const scopes = [
    ...new Set([
      ...measures.map((measure) => measure.scope),
      ...study.series.map((series) => series.scope),
    ]),
  ];
  const filename = `${report.clientName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}-case-study`;

  return (
    <div
      data-theme="light"
      data-export-root
      className="min-h-screen bg-surface-primary text-primary print:bg-white"
    >
      <style>{`@page { margin: 14mm 0; @top-left { content: ""; } @top-center { content: ""; } @top-right { content: ""; } @bottom-left { content: ""; } @bottom-center { content: ""; } @bottom-right { content: ""; } } @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`}</style>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 print:px-12 print:pt-0">
          <div className="flex items-center gap-3">
            <Logo variant="logo" className="h-6 w-auto" />
            <span className="border-l border-border pl-3 text-sm text-muted-foreground">
              Customer story
            </span>
          </div>
          <div
            {...{ [EXPORT_HIDE]: "" }}
            className="flex flex-wrap items-center gap-2 print:hidden"
          >
            {controls}
            {token && (
              <PngExport mediaBase={`/report/${token}`} filename={filename} />
            )}
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="size-3.5" />
              Save as PDF
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-12 px-4 py-10 sm:px-6 print:space-y-6 print:px-10 print:py-4">
        {!study.approval && (
          <div className="rounded-lg bg-amber-50 px-4 py-2.5 text-xs font-semibold tracking-wide text-amber-800 uppercase">
            Internal draft · customer approval required before sharing
          </div>
        )}

        <div className="grid grid-cols-1 overflow-hidden rounded-2xl bg-muted/50 md:grid-cols-2 print:break-inside-avoid print:grid-cols-[1fr_1.1fr]">
          <div className="flex flex-col justify-center gap-4 p-8 print:p-6">
            <Eyebrow>Performance by Wander · Customer story</Eyebrow>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              {report.clientName}
            </h1>
            <p className="text-xl leading-snug">{study.headline}</p>
          </div>
          {study.heroImageUrl && (
            <div className="relative min-h-64 print:min-h-56">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={study.heroImageUrl}
                alt={study.heroCaption ?? report.clientName}
                className="absolute inset-0 size-full object-cover"
              />
              {study.heroCaption && (
                <span className="absolute right-3 bottom-3 rounded bg-black/50 px-2 py-1 text-[11px] text-white">
                  {study.heroCaption}
                </span>
              )}
            </div>
          )}
        </div>

        {intro && <Story section={intro} />}

        <div className="space-y-3">
          <Prose text={study.summary} className="text-xl leading-snug" />
        </div>

        {featured.length > 0 && (
          <section className="rounded-2xl bg-muted/50 p-6 print:break-inside-avoid">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
              {featured.map((measure) => (
                <div key={`${measure.scope}-${measure.label}`}>
                  <div className="text-5xl font-semibold tracking-tight tabular-nums">
                    {caseStudyChange(measure)}
                  </div>
                  <div className="mt-2 text-[15px] font-semibold">
                    {measure.label}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {scopeLabel[measure.scope]}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <Comparison study={study} />

        {rest.map((section) => (
          <Story key={section.heading} section={section} />
        ))}

        <section className="space-y-6">
          <div>
            <Eyebrow>The results</Eyebrow>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">
              Before and after
            </h2>
          </div>
          <IndexBars measures={measures} />
        </section>

        {study.series.length > 0 && (
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2 print:grid-cols-2 print:gap-3">
            {study.series.map((series) => (
              <SeriesChart
                key={`${series.scope}-${series.label}`}
                series={series}
                study={study}
              />
            ))}
          </section>
        )}

        {study.showCreative && report.highlights.length > 0 && (
          <section className="space-y-4 print:break-inside-avoid">
            <h2 className="text-2xl font-semibold tracking-tight">
              Creative that worked
            </h2>
            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 print:grid-cols-2">
              {report.highlights.map((ad, index) => {
                const ctr = ratio(ad.linkClicks, ad.impressions);
                return (
                  <div
                    key={ad.providerAdId ?? index}
                    className="flex gap-4 rounded-2xl border border-border p-4"
                  >
                    {ad.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={ad.imageUrl}
                        alt={`${ad.title} ad`}
                        className="h-auto w-28 flex-none self-start rounded-lg border border-border bg-white object-cover object-top print:max-h-36 print:w-24"
                      />
                    )}
                    <div className="min-w-0 space-y-1.5">
                      <div className="text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">
                        {ad.format}
                      </div>
                      <div className="font-semibold">{ad.title}</div>
                      {ad.note && (
                        <p className="text-[13px] text-muted-foreground">
                          {ad.note}
                        </p>
                      )}
                      {ctr !== null && (
                        <div className="pt-1 text-sm">
                          <span className="font-semibold tabular-nums">
                            {(ctr * 100).toFixed(2)}%
                          </span>{" "}
                          <span className="text-muted-foreground">
                            link click-through
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <footer className="space-y-2 border-t border-border pt-5 text-xs text-muted-foreground print:break-inside-avoid">
          <p>
            Snapshot: {formatDate(report.endDate, true)}.{" "}
            {scopes
              .map((scope) => `${scopeLabel[scope]}: ${scopeNote[scope]}.`)
              .join(" ")}{" "}
            Before-and-after changes are observed, not proof of what caused
            them.
          </p>
          <p>
            Sources: {report.sources.map((source) => source.label).join("; ")}.
          </p>
        </footer>
      </main>
    </div>
  );
}
