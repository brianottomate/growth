import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";

import { workspaceActor } from "@/server/workspace-actor";
import { getSession } from "@/server/better-auth/server";
import { EmptyState } from "@/components/ui/empty-state";
import { isSettled, lineLabel, periodLabel } from "@/lib/performance-billing";
import { BUSINESS_LABEL, DELIVERY_LABEL } from "@/lib/performance-stage";
import {
  BrandSearch,
  type BrandSearchGroup,
} from "@/app/app/brands/BrandSearch";
import {
  loadPerformanceDesk,
  narrowDesk,
  type DeskBrand,
} from "@/server/services/performance-desk.service";
import {
  loadBrandReadiness,
  readinessLinks,
  type BrandReadiness,
  type IntakeSummary,
} from "@/server/services/performance-readiness.service";

import { JourneyBoard } from "../JourneyBoard";
import { journeyBrands } from "../journey-data";
import { cn } from "@/components/ui/lib/utils";
import { BrandLogo, panel, SectionLabel, tile } from "../_components";
import { ReadinessChecklist } from "../ReadinessChecklist";
import { StageChips } from "../StageChip";
import { BrandRowMenu } from "../BrandRowMenu";
import { SendLink } from "../SendLink";

export const metadata: Metadata = { title: "Clients · Wander Performance" };
export const dynamic = "force-dynamic";

const fmtDate = (d: Date) =>
  d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });

/**
 * The clients as a list, filtered on the page the way /brands is: one row per
 * client or prospect with what they filed on the intake form, where they
 * stand on the production checklist, where their campaigns are, and the
 * intake link to send when they have not filed yet.
 */
export default async function PerformanceClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const session = await getSession();
  if (!session?.user) redirect("/signin");
  const actor = await workspaceActor();
  if (!actor)
    return (
      <div className="text-muted-foreground">
        Select an organization to view clients.
      </div>
    );

  const desk = narrowDesk(await loadPerformanceDesk(actor.orgId), "client");
  const readiness = await loadBrandReadiness(desk.brands);

  const entry = (brand: DeskBrand) => ({
    key: brand.id,
    search: [
      brand.name,
      brand.slug,
      brand.website,
      brand.relationship,
      BUSINESS_LABEL[brand.business],
      DELIVERY_LABEL[brand.delivery],
      brand.billing
        ? `fee ${brand.billing.fee.paidAt ? "paid" : "open"} ads ${brand.billing.media.paidAt ? "paid" : "open"}`
        : null,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
    node: (
      <ClientRow brand={brand} readiness={readiness.get(brand.id) ?? null} />
    ),
  });
  // Unpaid first: that is the list someone asks about in Slack.
  const unpaid = desk.brands.filter((brand) => brand.business === "signed");
  const paid = desk.brands.filter((brand) => brand.business === "paid");
  const paused = desk.brands.filter((brand) => brand.business === "paused");
  const groups: BrandSearchGroup[] = [
    ...(unpaid.length
      ? [{ label: "Signed, not paid", entries: unpaid.map(entry) }]
      : []),
    ...(paid.length ? [{ label: "Paid", entries: paid.map(entry) }] : []),
    ...(paused.length ? [{ label: "Paused", entries: paused.map(entry) }] : []),
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Client journey</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Launch progress, the next setup step, and a workspace for each
            client.
          </p>
        </div>
        <nav
          aria-label="Client views"
          className="inline-flex rounded-lg border bg-muted/40 p-1"
        >
          {[
            { id: "journey", label: "Journey board" },
            { id: "cards", label: "Client cards" },
          ].map((item) => (
            <Link
              key={item.id}
              href={`/app/performance/clients?view=${item.id}`}
              aria-current={
                (view === "cards" ? item.id === "cards" : item.id === "journey")
                  ? "page"
                  : undefined
              }
              className={cn(
                "rounded-md px-3 py-2 text-xs font-medium",
                (view === "cards" ? item.id === "cards" : item.id === "journey")
                  ? "bg-background shadow-xs"
                  : "text-muted-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
      {desk.brands.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No clients yet"
          description="Prospects become clients on the Prospects tab."
        />
      ) : view === "cards" ? (
        <BrandSearch groups={groups} />
      ) : (
        <JourneyBoard
          brands={journeyBrands(desk.brands, readiness)}
          clientsOnly
        />
      )}
    </div>
  );
}

/** A scan-friendly launch summary; the Overview holds the full brief. */
function ClientRow({
  brand,
  readiness,
}: {
  brand: DeskBrand;
  readiness: BrandReadiness | null;
}) {
  const intake = readiness?.intake ?? null;
  const slug = brand.slug ?? brand.id;
  const overviewHref = `/app/performance/brands/${slug}`;
  const budget = brand.campaigns.reduce(
    (sum, campaign) => sum + campaign.budget,
    0,
  );
  const spend = brand.campaigns.reduce(
    (sum, campaign) => sum + campaign.spend,
    0,
  );
  const adCount = brand.campaigns.reduce(
    (sum, campaign) => sum + campaign.adCount,
    0,
  );
  const nextItem = readiness?.checklist.groups
    .flatMap((group) => group.items)
    .find((item) => !item.done);
  const nextHref = nextItem?.action
    ? readinessLinks(brand)[nextItem.action.to]
    : null;
  const stats = [
    {
      label:
        intake?.budget != null ? "Monthly media budget" : "Campaign budget",
      value:
        intake?.budget != null
          ? `$${intake.budget.toLocaleString()}/mo`
          : budget
            ? `$${budget.toLocaleString()}`
            : "Not set",
    },
    { label: "Spend to date", value: `$${spend.toLocaleString()}` },
    { label: "Campaigns", value: `${brand.campaigns.length} · ${adCount} ads` },
    {
      label: "Intake",
      value: intake
        ? `Filed ${fmtDate(intake.submittedAt)}`
        : "Waiting on intake",
    },
  ];
  return (
    <article className={cn(panel, "p-4 @xl:p-5")}>
      <div className="flex items-start gap-3">
        <BrandLogo brand={brand} className="size-10 text-[13px]" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              href={overviewHref}
              className="text-[15px] font-semibold hover:underline"
            >
              {brand.name}
            </Link>
            <StageChips business={brand.business} delivery={brand.delivery} />
          </div>
          {brand.website ? (
            <a
              href={brand.website}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted-foreground hover:underline"
            >
              {brand.website.replace(/^https?:\/\//, "")}
            </a>
          ) : null}
          {brand.billing ? <BillingLine billing={brand.billing} /> : null}
        </div>
        <BrandRowMenu
          brandId={brand.id}
          brandName={brand.name}
          business={brand.business}
          delivery={brand.delivery}
          billing={brand.billing}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 @3xl:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className={tile}>
            <p className="text-[11px] text-muted-foreground">{stat.label}</p>
            <p className="mt-1 text-sm font-semibold">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="min-w-0 space-y-2">
          <SectionLabel>Property preview</SectionLabel>
          {brand.featuredHomes.length ? (
            <ul className="grid grid-cols-3 gap-2">
              {brand.featuredHomes.slice(0, 3).map((home) => (
                <li key={home.id} className="min-w-0">
                  <div className="aspect-[16/9] overflow-hidden rounded-lg border bg-muted">
                    {home.photo ? (
                      // oxlint-disable-next-line nextjs/no-img-element
                      <img
                        src={home.photo}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : null}
                  </div>
                  <p
                    className="mt-1 truncate text-[11px] text-muted-foreground"
                    title={home.name}
                  >
                    {home.name}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              No property preview yet.
            </p>
          )}
        </section>
        <section className="min-w-0 space-y-2">
          <SectionLabel>
            {brand.delivery === "live"
              ? "Still to complete"
              : "Next checklist item"}
          </SectionLabel>
          <div className="rounded-lg border bg-background p-3 text-xs">
            <p className="font-medium">
              {nextItem?.label ??
                (readiness
                  ? "Checklist complete"
                  : "Open the launch brief to review setup")}
            </p>
            {nextItem?.detail ? (
              <p className="mt-1 text-muted-foreground">{nextItem.detail}</p>
            ) : null}
            {nextHref ? (
              <Link
                href={nextHref}
                className="mt-2 inline-block text-primary hover:underline"
              >
                {nextItem!.action!.label}
              </Link>
            ) : null}
          </div>
        </section>
      </div>

      {readiness ? (
        <div className="mt-3 border-t pt-1">
          <ReadinessChecklist
            checklist={readiness.checklist}
            links={readinessLinks(brand)}
          />
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {brand.pitchUrl ? (
            <SendLink label="Pitch page" url={brand.pitchUrl} />
          ) : null}
          {brand.intakeUrl ? (
            <SendLink
              label="Intake form"
              url={brand.intakeUrl}
              viewHref={intake ? `${overviewHref}#submission` : undefined}
              viewLabel="View submission"
            />
          ) : null}
        </div>
        <Link
          href={overviewHref}
          className="text-xs font-medium text-primary hover:underline"
        >
          Open launch brief →
        </Link>
      </div>

      {intake ? (
        <details className="mt-3 border-t pt-3">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            Intake details
          </summary>
          <IntakeFacts intake={intake} plan={brand.account?.plan ?? null} />
        </details>
      ) : null}
    </article>
  );
}

/** The intake as the client filed it, as tiles a rep reads before a call. */
function IntakeFacts({
  intake,
  plan,
}: {
  intake: IntakeSummary;
  plan: string | null;
}) {
  const tiles: {
    label: string;
    value: string;
    tone?: "ok" | "warn" | "muted";
  }[] = [
    ...(plan
      ? [
          {
            label: "Plan",
            value: plan
              .replace(/_/g, " ")
              .replace(/\b\w/g, (c) => c.toUpperCase()),
            tone: "ok" as const,
          },
        ]
      : []),
    {
      label: "Budget",
      value:
        intake.budget != null
          ? `$${intake.budget.toLocaleString()}/mo media`
          : intake.budgetIsRecommendation
            ? "Asked us to recommend"
            : "Not given",
      tone: intake.budget != null ? "ok" : "muted",
    },
    {
      label: "Ad access",
      value: intake.accessVerified
        ? "Verified"
        : intake.accessClaimed
          ? "Claimed, not seen"
          : "Not granted",
      tone: intake.accessVerified
        ? "ok"
        : intake.accessClaimed
          ? "warn"
          : "muted",
    },
    {
      label: "Homes",
      value:
        intake.homes === "all"
          ? "All of them"
          : intake.homes
            ? `${intake.homes} named${intake.homesOnRecord ? `, ${intake.homesOnRecord} on record` : ""}`
            : intake.homesOnRecord
              ? `${intake.homesOnRecord} on record`
              : "None named",
      tone: intake.homes !== null || intake.homesOnRecord > 0 ? "ok" : "muted",
    },
    {
      label: "Reports · invoice",
      value:
        intake.reportEmails || intake.invoiceEmail
          ? [intake.reportEmails, intake.invoiceEmail]
              .filter(Boolean)
              .join(" · ")
          : "Not given",
      tone: intake.reportEmails || intake.invoiceEmail ? "ok" : "muted",
    },
    {
      label: "Assets",
      value:
        [
          intake.creative ? "creative folder" : null,
          intake.guestList ? "guest list" : null,
          intake.ugc ? `UGC ${intake.ugc}` : null,
        ]
          .filter(Boolean)
          .join(" · ") || "None shared",
      tone: intake.creative || intake.guestList ? "ok" : "muted",
    },
  ];
  return (
    <div className="mt-4 space-y-3">
      <div className="grid grid-cols-2 gap-2.5 @2xl:grid-cols-3">
        {tiles.map((row) => (
          <div key={row.label} className={tile}>
            <SectionLabel className="text-[10px] tracking-[0.07em]">
              {row.label}
            </SectionLabel>
            <p
              className={cn(
                "mt-1 line-clamp-2 text-[12.5px] break-words",
                row.tone === "ok"
                  ? "font-semibold"
                  : row.tone === "warn"
                    ? "text-amber-300"
                    : "text-muted-foreground",
              )}
              title={row.value}
            >
              {/* An email wraps after its @, not mid-word. */}
              {row.value
                .split("@")
                .flatMap((part, i) =>
                  i === 0 ? [part] : ["@", <wbr key={i} />, part],
                )}
            </p>
          </div>
        ))}
      </div>
      {intake.notes ? (
        <p
          className="line-clamp-2 text-xs text-muted-foreground"
          title={intake.notes}
        >
          “{intake.notes}”
        </p>
      ) : null}
    </div>
  );
}

/** This month's two invoices and the spend against them, one quiet line. */
function BillingLine({
  billing,
}: {
  billing: NonNullable<DeskBrand["billing"]>;
}) {
  const settled = isSettled(billing);
  return (
    <p
      className={cn(
        "mt-1 flex flex-wrap items-center gap-x-3 text-xs",
        settled ? "text-muted-foreground" : "text-amber-300",
      )}
    >
      <span className="text-muted-foreground">
        {periodLabel(billing.period)}
      </span>
      <span>Fee {lineLabel(billing.fee)}</span>
      <span>Ads {lineLabel(billing.media)}</span>
      <span className="text-muted-foreground">
        ${billing.spend.toLocaleString("en-US")} spent
      </span>
    </p>
  );
}
