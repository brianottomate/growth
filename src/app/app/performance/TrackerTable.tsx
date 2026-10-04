"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/lib/utils";
import { trackerDate } from "@/lib/performance-settings";
import type { TrackerRow } from "@/server/services/performance-tracker.service";

import { TrackerChatButton } from "./TrackerChatButton";

const COLUMNS = [
  "Client",
  "Monthly management fee",
  "Effective date",
  "Terms",
  "End date",
  "WanderOS site live",
  "Agreed ad spend per month",
  "Actual ad spend",
  "Onboarding link",
  "FB access (intake)",
  "Ad creative",
  "Ad copies",
  "Ad delivery (app records)",
  "CPB",
  "Wander newsletter",
  "Influencer",
  "Social media posts",
  "Bookings",
] as const;

const COLUMN_GROUPS = {
  Commercial: [
    "Monthly management fee",
    "Effective date",
    "Terms",
    "End date",
    "Agreed ad spend per month",
  ],
  Setup: ["WanderOS site live", "Onboarding link", "FB access (intake)"],
  Creative: ["Ad creative", "Ad copies"],
  Delivery: ["Ad delivery (app records)"],
  Commitments: ["Wander newsletter", "Influencer", "Social media posts"],
  Results: ["Actual ad spend", "CPB", "Bookings"],
} as const;
type TrackerView = "All columns" | keyof typeof COLUMN_GROUPS;
const TRACKER_VIEWS: TrackerView[] = [
  "All columns",
  "Commercial",
  "Setup",
  "Creative",
  "Delivery",
  "Commitments",
  "Results",
];

const usd = (dollars: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(dollars);

/** Micaela's tracker sheet, filled from the app: one client per row. */
export function TrackerTable({
  rows,
  mobileCollapsed = false,
}: {
  rows: TrackerRow[];
  mobileCollapsed?: boolean;
}) {
  const [view, setView] = useState<TrackerView>("All columns");
  const includesColumn = (label: string) =>
    view === "All columns" ||
    label === "Client" ||
    (COLUMN_GROUPS[view] as readonly string[]).includes(label);
  const fieldsOf = (row: TrackerRow) =>
    trackerFields(row).filter(([label]) => includesColumn(label));
  const cards = (
    <div className="space-y-3">
      {rows.map((row) => {
        const fields = fieldsOf(row);
        const summary = new Set([
          "Monthly management fee",
          "Agreed ad spend per month",
          "Ad delivery (app records)",
        ]);
        return (
          <article key={row.brandId} className="rounded-xl border bg-card p-4">
            <header className="flex items-start justify-between gap-3">
              <h3 className="min-w-0 text-sm font-semibold [overflow-wrap:anywhere]">
                {row.slug ? (
                  <Link
                    className="inline-flex min-h-11 items-center hover:underline"
                    href={`/app/performance/clients/${row.slug}/settings`}
                  >
                    {row.name}
                  </Link>
                ) : (
                  row.name
                )}
              </h3>
              <TrackerChatButton
                brandId={row.brandId}
                brandName={row.name}
                row={chatSnapshot(row)}
              />
            </header>
            <dl className="mt-3 space-y-3">
              {fields
                .filter(
                  ([label]) => view !== "All columns" || summary.has(label),
                )
                .map(([label, value]) => (
                  <TrackerField key={label} label={label} value={value} />
                ))}
            </dl>
            {view === "All columns" ? (
              <details className="mt-3 border-t">
                <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">
                  All tracker details
                </summary>
                <dl className="space-y-3 pb-1">
                  {fields
                    .filter(([label]) => !summary.has(label))
                    .map(([label, value]) => (
                      <TrackerField key={label} label={label} value={value} />
                    ))}
                </dl>
              </details>
            ) : null}
          </article>
        );
      })}
    </div>
  );
  return (
    <>
      <div className="space-y-2 pb-3">
        <div
          role="group"
          aria-label="Tracker columns"
          className="flex flex-wrap gap-1"
        >
          {TRACKER_VIEWS.map((item) => (
            <Button
              key={item}
              variant={view === item ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={view === item}
              onClick={() => setView(item)}
            >
              {item}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Fees show billed or agreed amounts, not payment confirmation. Delivery
          and actual spend come from app campaign records.
        </p>
      </div>
      <div className="@3xl:hidden">
        {mobileCollapsed ? (
          <details className="rounded-xl border bg-card p-3">
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">
              View client tracker · {rows.length} clients
            </summary>
            {cards}
          </details>
        ) : (
          cards
        )}
      </div>
      <div className="hidden overflow-x-auto rounded-xl border bg-card @3xl:block">
        <table className="w-full min-w-max border-collapse text-xs">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-[11px] text-muted-foreground">
              {COLUMNS.filter(includesColumn).map((label, index) => (
                <th
                  key={label}
                  scope="col"
                  className={cn(
                    "px-3 py-2 font-medium whitespace-nowrap",
                    index === 0 && "sticky left-0 z-10 bg-card",
                  )}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.brandId} className="border-b last:border-0">
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-medium whitespace-nowrap"
                >
                  <span className="flex items-center justify-between gap-3">
                    {row.slug ? (
                      <Link
                        href={`/app/performance/clients/${row.slug}/settings`}
                        className="hover:underline"
                      >
                        {row.name}
                      </Link>
                    ) : (
                      row.name
                    )}
                    <TrackerChatButton
                      brandId={row.brandId}
                      brandName={row.name}
                      row={chatSnapshot(row)}
                    />
                  </span>
                </th>
                {fieldsOf(row).map(([label, value]) => (
                  <Cell key={label}>{value}</Cell>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function TrackerField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 [overflow-wrap:anywhere]">{value ?? "—"}</dd>
    </div>
  );
}

// Both layouts use the same values, so switching widths cannot hide a field
// or report a different delivery/billing state.
function trackerFields(row: TrackerRow): [string, ReactNode][] {
  return [
    ["Monthly management fee", row.fee != null ? usd(row.fee) : null],
    ["Effective date", trackerDate(row.effectiveDate)],
    ["Terms", row.terms],
    ["End date", trackerDate(row.endDate)],
    ["WanderOS site live", row.siteLive],
    [
      "Agreed ad spend per month",
      row.agreedAdSpend != null ? usd(row.agreedAdSpend) : null,
    ],
    ["Actual ad spend", row.spent > 0 ? usd(row.spent) : null],
    [
      "Onboarding link",
      row.onboardingLink ? (
        <Out key="onboarding" href={row.onboardingLink}>
          Intake form
        </Out>
      ) : null,
    ],
    [
      "FB access (intake)",
      row.fb === "verified" ? "Yes" : row.fb === "claimed" ? "Claimed" : null,
    ],
    [
      "Ad creative",
      row.creative.length ? (
        <span key="creative" className="flex flex-wrap gap-2">
          {row.creative.map((item) => (
            <Out key={item.label} href={item.url}>
              {row.creative.length === 1 ? "Folder" : item.label}
            </Out>
          ))}
        </span>
      ) : null,
    ],
    [
      "Ad copies",
      row.adCopiesUrl ? (
        <Out key="copies" href={row.adCopiesUrl}>
          Doc
        </Out>
      ) : null,
    ],
    [
      "Ad delivery (app records)",
      row.adsLive === "live"
        ? "Live"
        : row.adsLive === "paused"
          ? "Built, paused"
          : row.adsLive === "draft"
            ? "Drafted"
            : null,
    ],
    ["CPB", row.cpb != null ? usd(row.cpb) : null],
    ["Wander newsletter", row.newsletter],
    ["Influencer", row.influencer],
    ["Social media posts", row.socialMediaPosts],
    ["Bookings", row.bookings != null ? String(row.bookings) : null],
  ];
}

function Cell({ children }: { children: ReactNode }) {
  return (
    <td className="px-3 py-2 whitespace-nowrap">
      {children ?? <span className="text-muted-foreground/50">—</span>}
    </td>
  );
}

function Out({ href, children }: { href: string; children: ReactNode }) {
  if (!/^https?:\/\//i.test(href)) return <span>{children}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary hover:underline"
    >
      {children}
    </a>
  );
}

/** What the chat is told the row says: the same cells, as plain values. */
function chatSnapshot(row: TrackerRow): Record<string, string | number | null> {
  return {
    monthlyFee: row.fee,
    effectiveDate: row.effectiveDate,
    terms: row.terms,
    endDate: row.endDate,
    siteLive: row.siteLive,
    agreedAdSpend: row.agreedAdSpend,
    actualAdSpend: row.spent,
    fbConnection: row.fb,
    adCreative:
      row.creative.map((item) => `${item.label}: ${item.url}`).join(", ") ||
      null,
    adCopiesUrl: row.adCopiesUrl,
    adsLive: row.adsLive,
    cpb: row.cpb,
    newsletter: row.newsletter,
    influencer: row.influencer,
    socialMediaPosts: row.socialMediaPosts,
    bookings: row.bookings,
  };
}
