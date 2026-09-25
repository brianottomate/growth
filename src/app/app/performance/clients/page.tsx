import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { Building2 } from "lucide-react";

import { db } from "@/server/db";
import { memberTable } from "@/server/db/schema";
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

import { cn } from "@/components/ui/lib/utils";
import {
  brandAdsHref,
  BrandLogo,
  CampaignRow,
  panel,
  SectionLabel,
  tile,
} from "../_components";
import { ReadinessChecklist } from "../ReadinessChecklist";
import { StageChips } from "../StageChip";
import { StartCampaignInChat } from "../StartCampaignInChat";
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
export default async function PerformanceClientsPage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");
  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization;
  if (!org)
    return <div className="text-muted-foreground">No organization found.</div>;

  const desk = narrowDesk(await loadPerformanceDesk(org.id), "client");
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
    <div className="space-y-2">
      {desk.brands.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No clients yet"
          description="Prospects become clients on the Prospects tab."
        />
      ) : (
        <BrandSearch groups={groups} />
      )}
    </div>
  );
}

/** One client: who they are on one line, what they filed as tiles, and what is missing. */
function ClientRow({
  brand,
  readiness,
}: {
  brand: DeskBrand;
  readiness: BrandReadiness | null;
}) {
  const intake = readiness?.intake ?? null;
  const meta = [
    intake
      ? `intake filed ${fmtDate(intake.submittedAt)}${intake.by ? ` by ${intake.by}` : ""}`
      : "no intake yet",
  ];
  return (
    <article className={cn(panel, "p-5")}>
      <div className="flex flex-wrap items-center gap-3">
        <BrandLogo brand={brand} className="size-10 text-[13px]" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/app/performance/brands/${brand.slug ?? brand.id}`}
              className="text-[14.5px] font-semibold hover:underline"
            >
              {brand.name}
            </Link>
            <StageChips business={brand.business} delivery={brand.delivery} />
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {brand.website ? (
              <a
                href={brand.website}
                target="_blank"
                rel="noreferrer"
                className="hover:underline"
              >
                {brand.website.replace(/^https?:\/\//, "")}
              </a>
            ) : null}
            {brand.website ? " · " : ""}
            {meta.join(" · ")}
          </p>
          {brand.billing ? <BillingLine billing={brand.billing} /> : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {brand.pitchUrl ? (
            <SendLink label="Pitch page" url={brand.pitchUrl} />
          ) : null}
          {brand.intakeUrl ? (
            <SendLink
              label="Intake form"
              url={brand.intakeUrl}
              viewHref={
                intake
                  ? `/app/performance/brands/${brand.slug ?? brand.id}/submission`
                  : undefined
              }
              viewLabel="View submission"
            />
          ) : null}
          <BrandRowMenu
            brandId={brand.id}
            brandName={brand.name}
            business={brand.business}
            delivery={brand.delivery}
            billing={brand.billing}
          />
        </div>
      </div>

      {intake ? (
        <IntakeFacts intake={intake} plan={brand.account?.plan ?? null} />
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">
          {brand.intakeUrl
            ? "No intake filed yet."
            : "No intake filed, and no intake link for this brand."}
        </p>
      )}

      {readiness ? (
        <div className="mt-4 border-t pt-1">
          <ReadinessChecklist
            checklist={readiness.checklist}
            links={readinessLinks(brand)}
          />
        </div>
      ) : null}

      <div className="mt-4 space-y-2 border-t pt-3">
        <div className="flex items-baseline justify-between">
          <SectionLabel>
            Campaigns
            {brand.campaigns.length ? ` · ${brand.campaigns.length}` : ""}
          </SectionLabel>
          {brand.campaigns.length === 0 ? (
            <StartCampaignInChat brandId={brand.id} brandName={brand.name} />
          ) : (
            <Link
              href={brandAdsHref(brand)}
              className="text-[11.5px] text-sky-300 hover:underline"
            >
              View campaigns
            </Link>
          )}
        </div>
        {brand.campaigns.length > 0 ? (
          <ul className="divide-y rounded-xl border">
            {brand.campaigns.map((campaign) => (
              <CampaignRow
                key={campaign.id}
                brand={brand}
                campaign={campaign}
              />
            ))}
          </ul>
        ) : null}
      </div>

      {!brand.hasMark ? (
        <div className="mt-4 flex items-center gap-2 border-t pt-3 text-xs text-amber-300">
          <span className="size-1.5 rounded-full bg-amber-400" />
          Brand mark missing, so cards render without the logo.
          <Link
            href={`/app/brands/${brand.slug ?? brand.id}#brand-mark`}
            className="text-sky-300 hover:underline"
          >
            Fix
          </Link>
        </div>
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
      <div className="grid grid-cols-2 gap-2.5 @2xl:grid-cols-3 @4xl:grid-cols-6">
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
