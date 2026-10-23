import Link from "next/link";
import type { ReactNode } from "react";

import type { PerformanceConnectionSummary } from "@/lib/performance-connections";
import { performanceCardFromBrand } from "@/lib/performance-card";
import { CardBilling } from "./CardBilling";
import { ConnectionDots } from "./CardConnections";
import { cn } from "@/components/ui/lib/utils";
import type { DeskBrand } from "@/server/services/performance-desk.service";
import {
  readinessLinks,
  type BrandReadiness,
  type IntakeSummary,
} from "@/server/services/performance-readiness.service";

import {
  brandAdsHref,
  BrandLogo,
  CampaignRow,
  panel,
  SectionLabel,
  tile,
} from "./_components";
import { ExpandableList } from "./ExpandableList";
import { ReadinessChecklist } from "./ReadinessChecklist";
import { BusinessChip, DeliveryChip, PipelineStageChip } from "./StageChip";
import { PIPELINE_COLUMNS, pipelineStage } from "@/lib/performance-pipeline";
import { BUSINESS_LABEL } from "@/lib/performance-stage";
import { StartCampaignInChat } from "./StartCampaignInChat";
import { BrandRowMenu } from "./BrandRowMenu";
import { SendLink } from "./SendLink";

const fmtDate = (d: Date) =>
  d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });

/** The card for every client, keyed by brand id, for the Dashboard's list layout. */
export function clientDetails(
  brands: DeskBrand[],
  readiness: Map<string, BrandReadiness>,
  connections: Map<string, PerformanceConnectionSummary>,
): Record<string, ReactNode> {
  return Object.fromEntries(
    brands
      .filter((brand) => brand.relationship !== "prospect")
      .map((brand) => [
        brand.id,
        <ClientCard
          key={brand.id}
          brand={brand}
          readiness={readiness.get(brand.id) ?? null}
          connections={connections.get(brand.id)}
        />,
      ]),
  );
}

/**
 * One client: who they are on one line with the links a rep sends, what they
 * filed as tiles, where the checklist stands, and their campaigns.
 */
export function ClientCard({
  brand,
  readiness,
  connections,
}: {
  brand: DeskBrand;
  readiness: BrandReadiness | null;
  connections?: PerformanceConnectionSummary;
}) {
  const intake = readiness?.intake ?? null;
  const slug = brand.slug ?? brand.id;
  const stage = pipelineStage(brand);
  // The stage column and the business stage both have a "Signed"; say it once.
  const businessRepeatsStage =
    PIPELINE_COLUMNS.find((column) => column.id === stage)?.name ===
    BUSINESS_LABEL[brand.business];
  const meta = intake
    ? `intake filed ${fmtDate(intake.submittedAt)}${intake.by ? ` by ${intake.by}` : ""}`
    : "no intake yet";
  return (
    <article className={cn(panel, "p-4 sm:p-5")}>
      <div className="flex items-start gap-3">
        <BrandLogo brand={brand} className="size-10 text-[13px]" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              href={`/app/performance/clients/${slug}`}
              className="text-[15px] font-semibold hover:underline"
            >
              {brand.name}
            </Link>
            <PipelineStageChip stage={stage} />
            {businessRepeatsStage ? null : (
              <BusinessChip stage={brand.business} />
            )}
            <DeliveryChip stage={brand.delivery} />
          </div>
          <p className="truncate text-xs text-muted-foreground">
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
            {meta}
          </p>
          <ConnectionDots
            connections={connections}
            href={`/app/performance/clients/${slug}`}
          />
          <CardBilling
            card={performanceCardFromBrand(brand)}
            className="mt-2"
          />
          {brand.billing && (
            <p className="mt-1 text-xs text-muted-foreground">
              ${brand.billing.spend.toLocaleString("en-US")} spent this month
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {brand.pitchUrl ? (
            <SendLink label="Pitch page" url={brand.pitchUrl} />
          ) : null}
          {brand.intakeUrl ? (
            <SendLink
              label="Intake form"
              url={brand.intakeUrl}
              viewHref={
                intake
                  ? `/app/performance/clients/${slug}#submission`
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

      {brand.featuredHomes.length > 0 ? (
        <ul className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {brand.featuredHomes.map((home) => (
            <li key={home.id} className="w-24 shrink-0 sm:w-28">
              <div className="aspect-[4/3] overflow-hidden rounded-lg border bg-muted">
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
              <p className="mt-1 truncate text-[11px] text-muted-foreground">
                {home.name}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

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
            brandId={brand.id}
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
              className="text-[11.5px] hover:underline"
              style={{ color: "var(--color-link)" }}
            >
              View campaigns
            </Link>
          )}
        </div>
        {brand.campaigns.length > 0 ? (
          <ExpandableList limit={2} noun="campaigns">
            {brand.campaigns.map((campaign) => (
              <CampaignRow
                key={campaign.id}
                brand={brand}
                campaign={campaign}
              />
            ))}
          </ExpandableList>
        ) : null}
      </div>

      {!brand.hasMark ? (
        <div
          className="mt-4 flex items-center gap-2 border-t pt-3 text-xs"
          style={{ color: "var(--color-warning)" }}
        >
          <span className="size-1.5 rounded-full bg-current" />
          Brand mark missing, so cards render without the logo.
          <Link
            href={`/app/brands/${brand.slug ?? brand.id}#brand-mark`}
            className="hover:underline"
            style={{ color: "var(--color-link)" }}
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
                    ? ""
                    : "text-muted-foreground",
              )}
              style={
                row.tone === "warn"
                  ? { color: "var(--color-warning)" }
                  : undefined
              }
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
