import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { Building2, ExternalLink } from "lucide-react";

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
  type DeskBrand,
} from "@/server/services/performance-desk.service";

import { brandAdsHref, BrandLogo, StateChip } from "../_components";
import { NewClientDialog } from "../NewClientDialog";
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

  const desk = await loadPerformanceDesk(org.id);
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
  const groups: BrandSearchGroup[] = [
    {
      label: "Clients",
      entries: desk.brands.filter((brand) => brand.relationship === "client").map(entry),
    },
    {
      label: "Prospects",
      entries: desk.brands.filter((brand) => brand.relationship === "prospect").map(entry),
    },
    {
      label: "Wander's own",
      entries: desk.brands.filter((brand) => brand.relationship === "internal").map(entry),
      defaultHidden: true,
    },
  ];
  const total = groups[0]!.entries.length + groups[1]!.entries.length;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground max-w-xl text-sm">
          {total} client{total === 1 ? "" : "s"} and prospects. Each row shows
          what they filed on the intake form and where their campaigns stand.
        </p>
        <NewClientDialog />
      </div>
      {desk.brands.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No clients yet"
          description="Add a client by its website and the assistant sets the brand up and drafts its first ads."
          actions={<NewClientDialog />}
        />
      ) : (
        <BrandSearch groups={groups} />
      )}
    </div>
  );
}

/** One client: identity, what they filed, and where their campaigns stand. */
function ClientRow({ brand, intake }: { brand: DeskBrand; intake: IntakeSummary | null }) {
  const live = brand.campaigns.filter((campaign) => campaign.state === "live").length;
  const drafts = brand.campaigns.filter((campaign) => campaign.state === "draft").length;
  return (
    <article className="bg-card rounded-xl border">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <BrandLogo brand={brand} className="size-10" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/app/brands/${brand.slug ?? brand.id}`}
              className="truncate text-sm font-semibold hover:underline"
            >
              {brand.name}
            </Link>
            <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-medium capitalize">
              {brand.relationship}
            </span>
            {brand.account ? (
              <span className="text-muted-foreground text-[11px] capitalize">
                {brand.account.status}
                {brand.account.plan ? ` · ${brand.account.plan.replace(/_/g, " ")}` : ""}
              </span>
            ) : null}
            {brand.best ? <StateChip state={brand.best} /> : null}
          </div>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
            {brand.website ? (
              <a
                href={brand.website}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 hover:underline"
              >
                {brand.website.replace(/^https?:\/\//, "")}
                <ExternalLink className="size-3" />
              </a>
            ) : null}
            <span>
              {brand.campaigns.length === 0
                ? "No campaign yet"
                : [
                    `${brand.campaigns.length} campaign${brand.campaigns.length === 1 ? "" : "s"}`,
                    live ? `${live} live` : null,
                    drafts ? `${drafts} draft${drafts === 1 ? "" : "s"}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
            </span>
            <span className={brand.hasMark ? "" : "text-amber-300"}>
              {brand.hasMark ? "Mark set" : "Mark missing"}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Link href={brandAdsHref(brand)} className="font-medium hover:underline">
            {brand.campaigns.length === 0 ? "Start a campaign" : "Campaigns"}
          </Link>
          {brand.account ? (
            <Link
              href={`/app/performance/${brand.account.id}`}
              className="text-muted-foreground hover:underline"
            >
              Account
            </Link>
          ) : null}
          {brand.intakeUrl ? <IntakeLink url={brand.intakeUrl} /> : null}
        </div>
      </div>

      {brand.relationship !== "internal" ? (
        <div className="border-t px-4 py-3">
          {intake ? <IntakeFacts intake={intake} /> : (
            <p className="text-muted-foreground text-xs">
              No intake filed yet.{" "}
              {brand.intakeUrl
                ? "Send them the intake link; what they answer shows up here."
                : "This brand has no slug or connect token, so there is no intake link to send."}
            </p>
          )}
        </div>
      ) : null}
    </article>
  );
}

/** The intake as the client filed it, the facts a rep reads before a call. */
function IntakeFacts({ intake }: { intake: IntakeSummary }) {
  const facts: [string, string, boolean?][] = [
    [
      "Budget",
      intake.budget != null
        ? `$${intake.budget.toLocaleString()}/mo media`
        : intake.budgetIsRecommendation
          ? "Asked us to recommend"
          : "Not given",
      intake.budget != null,
    ],
    [
      "Homes",
      intake.homes === "all"
        ? "All of them"
        : intake.homes
          ? `${intake.homes} named${intake.homesOnRecord ? ` · ${intake.homesOnRecord} on record` : ""}`
          : intake.homesOnRecord
            ? `${intake.homesOnRecord} on record`
            : "None named",
      intake.homes !== null || intake.homesOnRecord > 0,
    ],
    [
      "Ad access",
      intake.accessVerified
        ? "Verified"
        : intake.accessClaimed
          ? "Claimed, not yet seen"
          : "Not granted",
      intake.accessVerified,
    ],
    ["Reports to", intake.reportEmails ?? "Not given", Boolean(intake.reportEmails)],
    ["Invoice to", intake.invoiceEmail ?? "Not given", Boolean(intake.invoiceEmail)],
    [
      "Assets",
      [intake.creative ? "creative folder" : null, intake.guestList ? "guest list" : null]
        .filter(Boolean)
        .join(", ") || "None shared",
      intake.creative || intake.guestList,
    ],
  ];
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-[11px]">
        Intake filed {fmtDate(intake.submittedAt)}
        {intake.by ? ` by ${intake.by}` : ""} ·{" "}
        <span className="capitalize">{intake.status}</span>
        {intake.ugc ? ` · UGC: ${intake.ugc}` : ""}
      </p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs @2xl:grid-cols-3 @4xl:grid-cols-6">
        {facts.map(([label, value, ok]) => (
          <div key={label} className="min-w-0">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className={ok === false ? "text-muted-foreground truncate" : "truncate font-medium"} title={value}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
      {intake.notes ? (
        <p className="text-muted-foreground line-clamp-2 text-xs" title={intake.notes}>
          “{intake.notes}”
        </p>
      ) : null}
    </div>
  );
}
