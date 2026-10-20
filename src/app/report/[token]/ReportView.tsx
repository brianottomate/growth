"use client";

import { Fragment } from "react";
import { CircleCheck, Printer } from "lucide-react";
import { Logo } from "@wandercom/design-system-web/ui/logo";

import { EXPORT_HIDE, PngExport } from "@/components/png-export";
import { Button } from "@/components/ui/button";
import {
  ratio,
  type PerformanceReportChannel,
  type PerformanceReportDeliverable,
} from "@/lib/performance-report";
import { cn } from "@/lib/utils";
import type { PerformanceReportPage } from "@/server/services/performance-report.service";

import { CaseStudyView } from "./CaseStudyView";

const usd = (value: number, cents = false) =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
const count = (value: number) => value.toLocaleString("en-US");
const percent = (value: number) => `${(value * 100).toFixed(2)}%`;

function formatDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "7d_click,1d_view" → "7-day click, 1-day view attribution". */
function attributionLabel(setting: string) {
  return `${setting
    .split(",")
    .map((window) =>
      window.replace(
        /^(\d+)d_(\w+)$/,
        (_, days: string, kind: string) => `${days}-day ${kind}`,
      ),
    )
    .join(", ")} attribution`;
}

/** Paragraphs split on blank lines; `**text**` is bold. Nothing else is markup. */
function Prose({ text }: { text: string }) {
  return text
    .split(/\n\s*\n/)
    .filter((paragraph) => paragraph.trim())
    .map((paragraph, index) => (
      <p key={index} className="max-w-prose text-[15px] leading-relaxed">
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

type Tile = { label: string; value: string; foot?: string; lead?: boolean };

function Tiles({ label, tiles }: { label: string; tiles: Tile[] }) {
  if (tiles.length === 0) return null;
  return (
    <div className="space-y-2.5">
      <div className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="rounded-xl bg-muted/60 px-4 py-4 print:break-inside-avoid"
          >
            <div className="text-[13px] text-muted-foreground">
              {tile.label}
            </div>
            <div
              className={cn(
                "mt-2 text-[26px] leading-none font-bold tracking-tight tabular-nums",
                tile.lead && "text-emerald-700",
              )}
            >
              {tile.value}
            </div>
            {tile.foot && (
              <div className="mt-2 text-xs text-muted-foreground/80">
                {tile.foot}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const statusLabel: Record<PerformanceReportDeliverable["status"], string> = {
  planned: "Planned",
  in_progress: "In progress",
  delivered: "Delivered",
};
const statusClass: Record<PerformanceReportDeliverable["status"], string> = {
  planned: "bg-muted text-muted-foreground",
  in_progress: "bg-amber-50 text-amber-700",
  delivered: "bg-emerald-50 text-emerald-700",
};

const platformLabel: Record<PerformanceReportChannel["platform"], string> = {
  meta_ads: "Meta Ads",
  google_ads: "Google Ads",
};
const platformSource: Record<PerformanceReportChannel["platform"], string> = {
  meta_ads: "Meta",
  google_ads: "Google",
};
const channelStatusLabel: Record<PerformanceReportChannel["status"], string> = {
  live: "Live",
  paused: "Paused",
  setting_up: "Setting up",
  planned: "Planned",
};

function Section({
  title,
  lede,
  children,
}: {
  title: string;
  lede?: string;
  children: React.ReactNode;
}) {
  return (
    // Sections are shorter than a page: printed whole, a heading never ends
    // up alone at the bottom of one page.
    <section className="space-y-4 print:break-inside-avoid">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {lede && (
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            {lede}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

export function ReportView({
  token,
  report,
}: {
  token?: string;
  report: PerformanceReportPage;
}) {
  if (report.caseStudy)
    return (
      <CaseStudyView token={token} report={report} study={report.caseStudy} />
    );
  const { metrics } = report;
  const roas = ratio(metrics.purchaseValue, metrics.spend);
  const costPerBooking = ratio(metrics.spend, metrics.bookings);
  const linkCtr = ratio(metrics.linkClicks, metrics.impressions);
  const filename = `${report.clientName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}-report-${report.endDate}`;

  // Paid bookings plus bookings earned outside ads (e.g. ChatGPT): the
  // blended view divides all ad spend by every booking the program drove.
  const otherBookings = report.otherBookings.reduce(
    (sum, source) => sum + source.bookings,
    0,
  );
  const allBookings = (metrics.bookings ?? 0) + otherBookings;
  const blendedCostPerBooking = ratio(metrics.spend, allBookings);
  const all: Tile[] =
    otherBookings > 0
      ? [
          {
            label: "Total bookings",
            value: count(allBookings),
            foot: [
              `${count(metrics.bookings ?? 0)} from ads`,
              ...report.otherBookings.map(
                (source) => `${count(source.bookings)} from ${source.label}`,
              ),
            ].join(", "),
            lead: true,
          },
          ...(blendedCostPerBooking !== null
            ? [
                {
                  label: "Blended cost per booking",
                  value: usd(blendedCostPerBooking),
                  foot: "Ad spend across all bookings",
                },
              ]
            : []),
          {
            label: "Total booking value",
            value: usd(
              (metrics.purchaseValue ?? 0) +
                report.otherBookings.reduce(
                  (sum, source) => sum + source.bookingValue,
                  0,
                ),
            ),
            foot: "Ads and other sources",
          },
        ]
      : [];

  const results: Tile[] = [];
  if (roas !== null)
    results.push({
      label: "Return on ad spend",
      value: `${roas.toFixed(2)}×`,
      foot: `≈ ${usd(roas, true)} per $1 spent`,
      lead: true,
    });
  results.push({
    label: "Ad spend",
    value: usd(metrics.spend),
    foot: `${usd(metrics.spend, true)} total`,
  });
  if (metrics.purchaseValue !== undefined)
    results.push({
      label: "Booking value",
      value: usd(metrics.purchaseValue),
      foot: `${usd(metrics.purchaseValue, true)} attributed`,
    });
  if (metrics.bookings !== undefined)
    results.push({ label: "Bookings", value: count(metrics.bookings) });
  if (costPerBooking !== null)
    results.push({
      label: "Cost per booking",
      value: usd(costPerBooking),
    });

  const reach: Tile[] = [];
  if (metrics.impressions !== undefined)
    reach.push({
      label: "Impressions",
      value: count(metrics.impressions),
      foot:
        metrics.reach !== undefined
          ? `${count(metrics.reach)} people reached`
          : undefined,
    });
  if (metrics.linkClicks !== undefined)
    reach.push({
      label: "Link clicks",
      value: count(metrics.linkClicks),
      foot: "To the booking site",
    });
  if (linkCtr !== null)
    reach.push({ label: "Link click-through", value: percent(linkCtr) });
  if (metrics.sitePageViews !== undefined)
    reach.push({
      label: "Site page views",
      value: count(metrics.sitePageViews),
      foot: "On your site, credited to the ads",
    });
  if (metrics.addToCart !== undefined)
    reach.push({
      label: "Add to cart",
      value: count(metrics.addToCart),
      foot: "Booking-intent events",
    });

  const { channels } = report;
  const upcoming = channels.filter((channel) => channel.status !== "live");

  const attribution = report.sources.find((s) => s.attribution)?.attribution;
  const conversion = report.sources.find((s) => s.conversion)?.conversion;

  return (
    <div
      data-theme="light"
      data-export-root
      className="min-h-screen bg-surface-primary text-primary print:bg-white"
    >
      {/* Every printed page gets a top and bottom margin, and the empty margin
          boxes replace the browser's date, title and URL header and footer. */}
      <style>{`@page { margin: 14mm 0; @top-left { content: ""; } @top-center { content: ""; } @top-right { content: ""; } @bottom-left { content: ""; } @bottom-center { content: ""; } @bottom-right { content: ""; } } @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`}</style>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 print:px-12 print:pt-0">
          <div className="flex items-center gap-3">
            <Logo variant="logo" className="h-6 w-auto" />
            <span className="border-l border-border pl-3 text-sm text-muted-foreground">
              Performance report
            </span>
          </div>
          <div {...{ [EXPORT_HIDE]: "" }} className="flex gap-2 print:hidden">
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

      <main className="mx-auto max-w-5xl space-y-12 px-4 py-10 sm:px-6 print:space-y-9 print:px-12 print:py-8">
        <div>
          {report.status === "draft" && (
            <div className="mb-4 inline-flex rounded-md bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
              Draft
            </div>
          )}
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {report.clientName}
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            Advertising performance and program status, {report.periodLabel}.
          </p>
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-muted-foreground">
            <span>
              <b className="font-semibold text-primary">Period</b>{" "}
              {formatDate(report.startDate)} to {formatDate(report.endDate)}
            </span>
            <span>
              <b className="font-semibold text-primary">
                {channels.length > 1 ? "Channels" : "Channel"}
              </b>{" "}
              {channels
                .map((channel) =>
                  channel.status === "live"
                    ? platformLabel[channel.platform]
                    : `${platformLabel[channel.platform]} (${channelStatusLabel[channel.status].toLowerCase()})`,
                )
                .join(", ")}
            </span>
          </div>
        </div>

        <Section title="Performance at a glance">
          <div className="space-y-5">
            <Tiles label="All bookings" tiles={all} />
            <Tiles
              label={all.length > 0 ? "Paid ads" : "Results"}
              tiles={results}
            />
            <Tiles label="Reach and engagement" tiles={reach} />
          </div>
        </Section>

        {(report.narrative || metrics.purchaseValue !== undefined) && (
          <Section title="Understanding the results">
            {report.narrative && (
              <div className="space-y-3">
                <Prose text={report.narrative} />
              </div>
            )}
            {metrics.purchaseValue !== undefined && roas !== null && (
              <div className="rounded-2xl border border-border bg-muted/40 p-5 print:break-inside-avoid">
                <div className="mb-4 text-[13px] font-semibold">
                  Spend vs. booking value
                </div>
                <div className="space-y-3">
                  {[
                    {
                      label: "Ad spend",
                      value: metrics.spend,
                      className: "bg-neutral-900 text-white",
                    },
                    {
                      label: "Booking value",
                      value: metrics.purchaseValue,
                      className: "bg-emerald-600 text-white",
                    },
                  ].map((bar) => (
                    <div
                      key={bar.label}
                      className="grid grid-cols-1 items-center gap-1.5 sm:grid-cols-[130px_1fr] sm:gap-4"
                    >
                      <div className="text-[13px]">{bar.label}</div>
                      <div className="h-9 overflow-hidden rounded-md bg-muted">
                        <div
                          className={cn(
                            "flex h-full items-center rounded-md px-3 text-[13px] font-semibold whitespace-nowrap tabular-nums",
                            bar.className,
                          )}
                          style={{
                            width: `${Math.max(
                              12,
                              (bar.value /
                                Math.max(
                                  metrics.spend,
                                  metrics.purchaseValue!,
                                )) *
                                100,
                            )}%`,
                          }}
                        >
                          {usd(bar.value)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap items-baseline gap-2.5 border-t border-border pt-4">
                  <span className="text-2xl font-bold text-emerald-700 tabular-nums">
                    {roas.toFixed(2)}×
                  </span>
                  <span className="text-xs text-muted-foreground">
                    return on ad spend, before cancellations, refunds and
                    management fees
                  </span>
                </div>
              </div>
            )}
          </Section>
        )}

        {report.otherBookings.length > 0 && (
          <Section
            title="Bookings beyond ads"
            lede="Bookings the program brought in outside paid advertising, counted from your booking data. They do not overlap the ad bookings above."
          >
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 print:grid-cols-2">
              {report.otherBookings.map((source) => (
                <div
                  key={source.label}
                  className="rounded-2xl border border-border bg-muted/40 p-5"
                >
                  <div className="text-[13px] font-semibold">
                    {source.label}
                  </div>
                  <div className="mt-2 flex items-baseline gap-3">
                    <span className="text-[26px] leading-none font-bold tabular-nums">
                      {count(source.bookings)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {source.bookings === 1 ? "booking" : "bookings"},{" "}
                      {usd(source.bookingValue, true)}
                    </span>
                  </div>
                  {source.note && (
                    <p className="mt-3 text-[13px] leading-snug text-muted-foreground">
                      {source.note}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {report.highlights.length > 0 && (
          <Section
            title="Creative highlights"
            lede="The ads that did the most for this period, as served in the feed."
          >
            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 print:grid-cols-2">
              {report.highlights.map((ad, index) => {
                const ctr = ratio(ad.linkClicks, ad.impressions);
                return (
                  <div
                    key={ad.providerAdId ?? index}
                    className="flex gap-4 rounded-2xl border border-border bg-muted/40 p-4 print:break-inside-avoid"
                  >
                    {ad.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={ad.imageUrl}
                        alt={`${ad.title} ad`}
                        className="h-auto w-32 flex-none self-start rounded-lg border border-border bg-white sm:w-40"
                      />
                    )}
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="self-start rounded-md bg-muted px-2 py-1 text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">
                        {ad.format}
                      </span>
                      <div className="mt-2.5 text-base leading-tight font-semibold">
                        {ad.title}
                      </div>
                      {ad.headline && (
                        <div className="mt-1 text-[13px] text-muted-foreground">
                          “{ad.headline}”
                        </div>
                      )}
                      {ad.note && (
                        <p className="mt-2 text-[13px] leading-snug text-muted-foreground">
                          {ad.note}
                        </p>
                      )}
                      <div className="mt-auto grid grid-cols-2 gap-x-3 gap-y-2.5 pt-4">
                        {[
                          ["Spend", usd(ad.spend)],
                          ["Impressions", count(ad.impressions)],
                          ["Link clicks", count(ad.linkClicks)],
                          ["Link CTR", ctr === null ? "–" : percent(ctr)],
                        ].map(([label, value]) => (
                          <div key={label}>
                            <div className="text-[17px] leading-none font-bold tabular-nums">
                              {value}
                            </div>
                            <div className="mt-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                              {label}
                            </div>
                          </div>
                        ))}
                      </div>
                      {ad.bookings !== undefined && ad.bookings > 0 && (
                        <span className="mt-3 inline-flex items-center gap-1.5 self-start rounded-md bg-emerald-50 px-2.5 py-1.5 text-[13px] font-semibold text-emerald-700">
                          <CircleCheck className="size-3.5" />
                          {ad.bookings}{" "}
                          {ad.bookings === 1 ? "booking" : "bookings"}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {upcoming.map((channel) => (
          <Section
            key={channel.platform}
            title={platformLabel[channel.platform]}
            lede={channel.summary}
          >
            <div className="rounded-2xl border border-border bg-muted/40 p-5 print:break-inside-avoid">
              <span
                className={cn(
                  "rounded-md px-2 py-1 text-xs font-semibold",
                  channel.status === "planned"
                    ? statusClass.planned
                    : statusClass.in_progress,
                )}
              >
                {channelStatusLabel[channel.status]}
              </span>
              {channel.details && channel.details.length > 0 && (
                <ul className="mt-4 space-y-2 text-sm">
                  {channel.details.map((detail) => (
                    <li key={detail} className="flex gap-2.5">
                      <span className="mt-2 size-1.5 flex-none rounded-full bg-muted-foreground/60" />
                      {detail}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Section>
        ))}

        {report.deliverables.length > 0 && (
          <Section
            title="Marketing deliverables"
            lede="Work running alongside paid advertising."
          >
            <div className="overflow-hidden rounded-2xl border border-border bg-muted/40">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                    <th className="px-4 py-3">Deliverable</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="hidden px-4 py-3 sm:table-cell">Update</th>
                  </tr>
                </thead>
                <tbody>
                  {report.deliverables.map((item) => (
                    <tr
                      key={item.name}
                      className="border-b border-border/60 align-top last:border-0 print:break-inside-avoid"
                    >
                      <td className="px-4 py-3.5 font-semibold">
                        {item.name}
                        <p className="mt-1 text-[13px] font-normal text-muted-foreground sm:hidden">
                          {item.update}
                        </p>
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={cn(
                            "rounded-md px-2 py-1 text-xs font-semibold whitespace-nowrap",
                            statusClass[item.status],
                          )}
                        >
                          {statusLabel[item.status]}
                        </span>
                      </td>
                      <td className="hidden px-4 py-3.5 text-[13px] text-muted-foreground sm:table-cell">
                        {item.update}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {/* The source note never prints alone: it stays with the last section. */}
        <div className="space-y-12 print:break-inside-avoid print:space-y-9">
          {report.recommendations && (
            <Section title="Next steps">
              <div className="space-y-3 rounded-2xl border border-border bg-muted/40 p-5 print:break-inside-avoid">
                <Prose text={report.recommendations} />
              </div>
            </Section>
          )}

          <footer className="space-y-1 border-t border-border pt-5 text-xs text-muted-foreground print:break-inside-avoid">
            <p>
              Advertising figures are as reported by{" "}
              {channels
                .filter((channel) => channel.status === "live")
                .map((channel) => platformSource[channel.platform])
                .join(" and ")}
              {attribution ? ` (${attributionLabel(attribution)})` : ""}
              {conversion ? `; bookings count ${conversion}` : ""}. Return on ad
              spend compares attributed booking value with ad spend. It is not
              profit and does not include management fees or other costs.
            </p>
          </footer>
        </div>
      </main>
    </div>
  );
}
