"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { BUSINESS_LABEL, type BusinessStage } from "@/lib/performance-stage";
import { matchesPortfolio } from "@/lib/performance-journey";
import type { PortfolioEvidence } from "@/server/services/performance-portfolio.service";
import { StageChips } from "../StageChip";
import type { DeliveryStage } from "@/lib/performance-stage";

export type ProspectPortfolioRow = {
  id: string;
  name: string;
  slug: string | null;
  website: string | null;
  logo: string | null;
  business: BusinessStage;
  delivery: DeliveryStage;
  campaigns: number;
  ads: number;
  evidence: PortfolioEvidence | null;
  relatedAccounts: {
    id: string;
    name: string;
    slug: string | null;
    business: BusinessStage;
  }[];
  actions: ReactNode;
};
const select = "rounded-lg border bg-background px-3 py-2 text-xs";
export function ProspectPortfolio({ rows }: { rows: ProspectPortfolioRow[] }) {
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("all");
  const [owner, setOwner] = useState("all");
  const [sort, setSort] = useState("name");
  const owners = [
    ...new Set(
      rows.flatMap((row) => (row.evidence?.owner ? [row.evidence.owner] : [])),
    ),
  ].sort();
  const stages = [...new Set(rows.map((row) => row.business))];
  const filtered = rows
    .filter(
      (row) =>
        (stage === "all" || row.business === stage) &&
        (owner === "all" ||
          (owner === "unassigned"
            ? !row.evidence?.owner
            : row.evidence?.owner === owner)) &&
        matchesPortfolio(
          [
            row.name,
            row.website,
            BUSINESS_LABEL[row.business],
            row.evidence?.owner,
            row.evidence?.location,
            row.evidence?.pms,
            row.evidence?.crmStage,
          ]
            .filter(Boolean)
            .join(" "),
          query,
        ),
    )
    .sort((a, b) =>
      sort === "units"
        ? (b.evidence?.units ?? -1) - (a.evidence?.units ?? -1) ||
          a.name.localeCompare(b.name)
        : a.name.localeCompare(b.name),
    );
  const reset = () => {
    setQuery("");
    setStage("all");
    setOwner("all");
    setSort("name");
  };
  return (
    <section className="space-y-4" aria-label="Prospect portfolio">
      <div>
        <h2 className="text-xl font-semibold">Prospect portfolio</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Qualify accounts, review CRM context, and hand off to the launch
          workspace.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
        {[
          { label: "Accounts in pipeline", value: rows.length },
          {
            label: "Pitch sent",
            value: rows.filter((row) => row.business === "pitch_sent").length,
          },
          {
            label: "Meeting booked",
            value: rows.filter((row) => row.business === "meeting_booked")
              .length,
          },
          {
            label: "Matched to lead records",
            value: rows.filter((row) => row.evidence?.matched).length,
          },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {stat.value}
            </p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative w-full max-w-sm">
          <span className="sr-only">Search prospect portfolio</span>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search account, CRM owner or market"
          />
        </label>
        <select
          aria-label="Filter prospect stage"
          value={stage}
          onChange={(event) => setStage(event.target.value)}
          className={select}
        >
          <option value="all">All prospect stages</option>
          {stages.map((value) => (
            <option key={value} value={value}>
              {BUSINESS_LABEL[value]}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter CRM owner"
          value={owner}
          onChange={(event) => setOwner(event.target.value)}
          className={select}
        >
          <option value="all">All CRM owners</option>
          <option value="unassigned">No CRM owner</option>
          {owners.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <select
          aria-label="Sort prospect portfolio"
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          className={select}
        >
          <option value="name">Account A–Z</option>
          <option value="units">Unit count: high to low</option>
        </select>
        <button
          type="button"
          className="px-2 py-2 text-xs hover:underline"
          onClick={reset}
        >
          Reset filters
        </button>
      </div>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {filtered.length} of {rows.length} accounts · CRM owners and unit counts
        come from matched lead records.
      </p>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[860px] text-left text-xs">
          <caption className="sr-only">
            Performance prospects with CRM evidence and launch actions
          </caption>
          <thead className="border-b bg-muted/30 text-muted-foreground">
            <tr>
              {[
                "Account",
                "Units / market",
                "CRM context",
                "Performance stage",
                "Next step",
              ].map((label) => (
                <th key={label} scope="col" className="px-4 py-3 font-medium">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((row) => {
              const href = `/app/performance/brands/${row.slug ?? row.id}`;
              const e = row.evidence;
              return (
                <tr key={row.id} className="align-top hover:bg-muted/20">
                  <td className="min-w-56 px-4 py-4">
                    <div className="flex items-start gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-background text-[10px] font-semibold">
                        {row.logo ? (
                          <>
                            {/* oxlint-disable-next-line nextjs/no-img-element */}
                            <img
                              src={row.logo}
                              alt=""
                              className="size-full object-contain p-1"
                            />
                          </>
                        ) : (
                          row.name.slice(0, 2)
                        )}
                      </div>
                      <div>
                        <Link
                          href={href}
                          className="text-sm font-semibold hover:underline"
                        >
                          {row.name}
                        </Link>
                        <p className="mt-1 text-muted-foreground">
                          {e?.domain ??
                            row.website
                              ?.replace(/^https?:\/\//, "")
                              .replace(/\/.*$/, "") ??
                            "No website"}
                        </p>
                        {row.relatedAccounts.map((other) => (
                          <p
                            key={other.id}
                            className="mt-2 max-w-64 rounded-lg border bg-muted/50 p-2 text-[11px]"
                          >
                            Same domain:{" "}
                            <Link
                              href={`/app/performance/brands/${other.slug ?? other.id}`}
                              className="font-medium underline"
                            >
                              {other.name} · {BUSINESS_LABEL[other.business]}
                            </Link>
                            <span className="mt-1 block text-muted-foreground">
                              Review account identity before outreach.
                            </span>
                          </p>
                        ))}
                        <Link
                          href={href}
                          className="mt-2 inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          Open workspace
                          <ArrowRight className="size-3" />
                        </Link>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <p className="font-semibold tabular-nums">
                      {e?.units != null ? `${e.units} units` : "Not on file"}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {e?.location ?? "Market not on file"}
                    </p>
                    {e?.pms ? (
                      <p className="mt-1 text-muted-foreground">{e.pms}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-4">
                    {e?.matched ? (
                      <>
                        <p>{e.owner ? `Owner ${e.owner}` : "No CRM owner"}</p>
                        <p className="mt-1 text-muted-foreground">
                          {e.crmStage ?? "CRM stage not on file"}
                        </p>
                        {e.hubspotUrl ? (
                          <a
                            href={e.hubspotUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            HubSpot
                            <ExternalLink className="size-3" />
                          </a>
                        ) : null}
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {e.syncedAt
                            ? `Synced ${new Date(e.syncedAt).toLocaleDateString("en-US")}`
                            : "Sync date unavailable"}
                        </p>
                      </>
                    ) : (
                      <p className="text-muted-foreground">
                        No matching lead record
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <StageChips
                      business={row.business}
                      delivery={row.delivery}
                    />
                    <p className="mt-2 text-muted-foreground">
                      {row.campaigns} campaigns · {row.ads} ads
                    </p>
                  </td>
                  <td className="min-w-56 px-4 py-4">
                    <p className="mb-3 font-medium">
                      {row.relatedAccounts.length
                        ? "Review the same-domain records"
                        : row.business === "meeting_booked"
                          ? "Review account before the call"
                          : row.business === "pitch_sent"
                            ? "Follow up on the pitch"
                            : "Review and share the pitch"}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      {row.actions}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!filtered.length ? (
          <div className="p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No prospects match these filters.
            </p>
            <button
              type="button"
              onClick={reset}
              className="mt-3 text-xs font-medium hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
