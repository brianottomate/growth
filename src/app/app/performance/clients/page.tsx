import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { Building2 } from "lucide-react";

import { db } from "@/server/db";
import {
  memberTable,
  performanceIntakeTable,
  performancePropertyTable,
} from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { EmptyState } from "@/components/ui/empty-state";
import { BrandSearch, type BrandSearchGroup } from "@/app/app/brands/BrandSearch";
import {
  loadPerformanceDesk,
  narrowDesk,
  type DeskBrand,
} from "@/server/services/performance-desk.service";

import { cn } from "@/components/ui/lib/utils";
import { brandAdsHref, BrandLogo, panel, pill, SectionLabel, StateChip, tile } from "../_components";
import { BrandRowMenu } from "../BrandRowMenu";
import { IntakeLink } from "./IntakeLink";

export const metadata: Metadata = { title: "Clients · Wander Performance" };
export const dynamic = "force-dynamic";

type IntakeSummary = {
  status: string;
  submittedAt: Date;
  by: string | null;
  budget: number | null;
  budgetIsRecommendation: boolean;
  homes: number | "all" | null;
  homesOnRecord: number;
  reportEmails: string | null;
  invoiceEmail: string | null;
  creative: boolean;
  guestList: boolean;
  ugc: string | null;
  accessClaimed: boolean;
  accessVerified: boolean;
  notes: string | null;
};

const fmtDate = (d: Date) =>
  d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });

/**
 * The clients as a list, filtered on the page the way /brands is: one row per
 * client or prospect with what they filed on the intake form, where their
 * campaigns stand, and the intake link to send when they have not filed yet.
 */
export default async function PerformanceClientsPage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");
  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization;
  if (!org) return <div className="text-muted-foreground">No organization found.</div>;

  const desk = narrowDesk(await loadPerformanceDesk(org.id), "client");
  const accountIds = desk.brands
    .map((brand) => brand.account?.id)
    .filter((id): id is string => Boolean(id));
  const [intakes, properties] = accountIds.length
    ? await Promise.all([
        db.query.performanceIntakeTable.findMany({
          where: inArray(performanceIntakeTable.accountId, accountIds),
          orderBy: (t, { desc }) => desc(t.submittedAt),
        }),
        db.query.performancePropertyTable.findMany({
          where: and(
            inArray(performancePropertyTable.accountId, accountIds),
            isNull(performancePropertyTable.deletedAt),
          ),
          columns: { accountId: true },
        }),
      ])
    : [[], []];
  const homesByAccount = new Map<string, number>();
  for (const row of properties) {
    homesByAccount.set(row.accountId, (homesByAccount.get(row.accountId) ?? 0) + 1);
  }
  // Newest intake per account; the receipt is verbatim, so read it whole.
  const intakeByAccount = new Map<string, IntakeSummary>();
  for (const row of intakes) {
    if (intakeByAccount.has(row.accountId)) continue;
    const answers = row.answers;
    intakeByAccount.set(row.accountId, {
      status: row.status,
      submittedAt: row.submittedAt,
      by: row.submittedByName ?? row.submittedByEmail ?? null,
      budget: row.mediaBudgetDollars,
      budgetIsRecommendation: row.budgetIsRecommendation,
      homes: answers.allProperties
        ? "all"
        : answers.propertyUrls?.length
          ? answers.propertyUrls.length
          : null,
      homesOnRecord: homesByAccount.get(row.accountId) ?? 0,
      reportEmails: answers.reportEmails?.trim() || null,
      invoiceEmail: answers.invoiceEmail?.trim() || null,
      creative: Boolean(answers.creativeDriveUrl),
      guestList: Boolean(answers.guestListDriveUrl),
      ugc: answers.ugcPermission?.trim() || null,
      accessClaimed: Boolean(row.accessClaimedAt),
      accessVerified: Boolean(row.zernioVerifiedAt),
      notes: [answers.propertyNotes, answers.anythingElse]
        .map((value) => value?.trim())
        .filter(Boolean)
        .join(" · ") || null,
    });
  }

  const entry = (brand: DeskBrand) => ({
    key: brand.id,
    search: [brand.name, brand.slug, brand.website, brand.relationship, brand.account?.status]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
    node: (
      <ClientRow
        brand={brand}
        intake={brand.account ? (intakeByAccount.get(brand.account.id) ?? null) : null}
      />
    ),
  });
  const groups: BrandSearchGroup[] = [{ label: "Clients", entries: desk.brands.map(entry) }];

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
function ClientRow({ brand, intake }: { brand: DeskBrand; intake: IntakeSummary | null }) {
  const live = brand.campaigns.filter((campaign) => campaign.state === "live").length;
  const drafts = brand.campaigns.filter((campaign) => campaign.state === "draft").length;
  const meta = [
    brand.campaigns.length === 0
      ? "no campaign yet"
      : [
          `${brand.campaigns.length} campaign${brand.campaigns.length === 1 ? "" : "s"}`,
          live ? `${live} live` : null,
          drafts ? `${drafts} draft${drafts === 1 ? "" : "s"}` : null,
        ]
          .filter(Boolean)
          .join(", "),
    intake ? `intake filed ${fmtDate(intake.submittedAt)}${intake.by ? ` by ${intake.by}` : ""}` : "no intake yet",
  ];
  return (
    <article className={cn(panel, "p-5")}>
      <div className="flex flex-wrap items-center gap-3">
        <BrandLogo brand={brand} className="size-10 text-[13px]" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/app/brands/${brand.slug ?? brand.id}`} className="text-[14.5px] font-semibold hover:underline">
              {brand.name}
            </Link>
            {brand.account?.plan ? (
              <span className="border-border/80 text-muted-foreground rounded-full border px-2 py-0.5 text-[10.5px] capitalize">
                {brand.account.plan.replace(/_/g, " ")}
              </span>
            ) : null}
            {brand.account ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 text-[11.5px] capitalize",
                  brand.account.status === "active" ? "text-emerald-300" : "text-muted-foreground",
                )}
              >
                <span className={cn("size-1.5 rounded-full", brand.account.status === "active" ? "bg-emerald-400" : "bg-white/30")} />
                {brand.account.status}
              </span>
            ) : null}
            {brand.best ? <StateChip state={brand.best} /> : null}
          </div>
          <p className="text-muted-foreground mt-0.5 truncate text-xs">
            {brand.website ? (
              <a href={brand.website} target="_blank" rel="noreferrer" className="hover:underline">
                {brand.website.replace(/^https?:\/\//, "")}
              </a>
            ) : null}
            {brand.website ? " · " : ""}
            {meta.join(" · ")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Link
            href={brandAdsHref(brand)}
            className={cn(pill, "border-border/80 hover:bg-muted/60 inline-flex items-center border px-3 py-1.5 text-xs font-semibold")}
          >
            {brand.campaigns.length === 0 ? "Start a campaign" : "Campaigns"}
          </Link>
          {brand.pitchUrl ? <IntakeLink url={brand.pitchUrl} label="Copy pitch link" /> : null}
          {brand.intakeUrl ? <IntakeLink url={brand.intakeUrl} /> : null}
          <BrandRowMenu brandId={brand.id} brandName={brand.name} relationship="client" />
        </div>
      </div>

      {intake ? (
        <IntakeFacts intake={intake} />
      ) : (
        <p className="text-muted-foreground mt-4 text-xs">
          {brand.intakeUrl ? "No intake filed yet." : "No intake filed, and no intake link for this brand."}
        </p>
      )}

      {!brand.hasMark ? (
        <div className="mt-4 flex items-center gap-2 border-t pt-3 text-xs text-amber-300">
          <span className="size-1.5 rounded-full bg-amber-400" />
          Brand mark missing, so cards render without the logo.
          <Link href={`/app/brands/${brand.slug ?? brand.id}#brand-mark`} className="text-sky-300 hover:underline">
            Fix
          </Link>
        </div>
      ) : null}
    </article>
  );
}

/** The intake as the client filed it, as tiles a rep reads before a call. */
function IntakeFacts({ intake }: { intake: IntakeSummary }) {
  const tiles: { label: string; value: string; tone?: "ok" | "warn" | "muted" }[] = [
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
      value: intake.accessVerified ? "Verified" : intake.accessClaimed ? "Claimed, not seen" : "Not granted",
      tone: intake.accessVerified ? "ok" : intake.accessClaimed ? "warn" : "muted",
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
          ? [intake.reportEmails, intake.invoiceEmail].filter(Boolean).join(" · ")
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
      <div className="grid grid-cols-2 gap-2.5 @2xl:grid-cols-3 @4xl:grid-cols-5">
        {tiles.map((row) => (
          <div key={row.label} className={tile}>
            <SectionLabel className="text-[10px] tracking-[0.07em]">{row.label}</SectionLabel>
            <p
              className={cn(
                "mt-1 truncate text-[12.5px]",
                row.tone === "ok" ? "font-semibold" : row.tone === "warn" ? "text-amber-300" : "text-muted-foreground",
              )}
              title={row.value}
            >
              {row.value}
            </p>
          </div>
        ))}
      </div>
      {intake.notes ? (
        <p className="text-muted-foreground line-clamp-2 text-xs" title={intake.notes}>
          “{intake.notes}”
        </p>
      ) : null}
    </div>
  );
}
