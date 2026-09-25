import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/components/ui/lib/utils";
import { trackerDate } from "@/lib/performance-settings";
import type { TrackerRow } from "@/server/services/performance-tracker.service";

import { TrackerChatButton } from "./TrackerChatButton";

const COLUMNS = [
  "Client",
  "Paid fee per month",
  "Effective date",
  "Terms",
  "End date",
  "WanderOS site live",
  "Agreed ad spend per month",
  "Billed ad spend",
  "Onboarding link",
  "FB connection",
  "Ad creative",
  "Ad copies",
  "Ads live",
  "CPB",
  "Wander newsletter",
  "Influencer",
  "Social media posts",
  "Bookings",
] as const;

const usd = (dollars: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(dollars);

/** Micaela's tracker sheet, filled from the app: one client per row. */
export function TrackerTable({ rows }: { rows: TrackerRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full min-w-max border-collapse text-xs">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-[11px] text-muted-foreground">
            {COLUMNS.map((label, index) => (
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
                      href={`/app/performance/brands/${row.slug}/settings`}
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
              <Cell>{row.fee != null ? usd(row.fee) : null}</Cell>
              <Cell>{trackerDate(row.effectiveDate)}</Cell>
              <Cell>{row.terms}</Cell>
              <Cell>{trackerDate(row.endDate)}</Cell>
              <Cell>{row.siteLive}</Cell>
              <Cell>
                {row.agreedAdSpend != null ? usd(row.agreedAdSpend) : null}
              </Cell>
              <Cell>{row.spent > 0 ? usd(row.spent) : null}</Cell>
              <Cell>
                {row.onboardingLink ? (
                  <Out href={row.onboardingLink}>Intake form</Out>
                ) : null}
              </Cell>
              <Cell>
                {row.fb === "verified"
                  ? "Yes"
                  : row.fb === "claimed"
                    ? "Claimed"
                    : null}
              </Cell>
              <Cell>
                {row.creative.length ? (
                  <span className="flex gap-2">
                    {row.creative.map((item) => (
                      <Out key={item.label} href={item.url}>
                        {row.creative.length === 1 ? "Folder" : item.label}
                      </Out>
                    ))}
                  </span>
                ) : null}
              </Cell>
              <Cell>
                {row.adCopiesUrl ? <Out href={row.adCopiesUrl}>Doc</Out> : null}
              </Cell>
              <Cell>
                {row.adsLive === "live"
                  ? "Yes"
                  : row.adsLive === "paused"
                    ? "Built, paused"
                    : row.adsLive === "draft"
                      ? "Drafted"
                      : null}
              </Cell>
              <Cell>{row.cpb != null ? usd(row.cpb) : null}</Cell>
              <Cell>{row.newsletter}</Cell>
              <Cell>{row.influencer}</Cell>
              <Cell>{row.socialMediaPosts}</Cell>
              <Cell>{row.bookings != null ? String(row.bookings) : null}</Cell>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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
    billedAdSpend: row.spent,
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
