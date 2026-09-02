import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/server/db";
import {
  brandTable,
  performanceAccountTable,
  performanceCycleTable,
  performanceIntakeTable,
  performancePropertyTable,
  type PerformanceIntake,
  type PerformanceIntakeAnswers,
} from "@/server/db/schema";
import { intakeBrandRef } from "@/lib/intake-ref";
import { zernioConnectionMatchesPlatform } from "@/lib/zernio-ads";
import {
  isZernioConfigured,
  listZernioAccounts,
  listZernioFacebookPages,
  type ZernioFacebookPage,
} from "@/server/clients/zernio.client";
import {
  PerformanceError,
  type PerformanceActor,
} from "@/server/services/performance.service";

// ---- PERFORMANCE+ INTAKE ---------------------------------------------------
//
// The client fills one form at /intake/[token] and we write a RECEIPT. Nothing
// downstream reads that receipt as state: `applyPerformanceIntake` promotes it
// into the tables that own each fact — contact on the account, money on the
// cycle, homes on performance_property, logo on the brand — and after that the
// receipt is history. This is the same draft-then-apply shape as the content
// loop and the ads plan/compile split, for the same reason: a form that stays
// authoritative goes stale the first time a client changes their mind.

/** Whole dollars from whatever the budget step produced ("$6,400", "6400"). */
export function parseBudgetDollars(raw: string | undefined): number | null {
  if (!raw) return null;
  const digits = raw.replace(/[^0-9.]/g, "");
  if (!digits) return null;
  const value = Number.parseFloat(digits);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value);
}

/** The current period key, matching performance_cycle.period ("YYYY-MM"). */
export function currentPeriod(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Resolve one submitted property name to a row shape.
 *
 * A name is all the form collects, so `siteUrl` stays null until someone
 * matches it against the client's booking site. That is deliberate: guessing
 * a URL from a title would produce links that 404 in a live ad.
 */
export function propertyRowsFromAnswers(
  accountId: string,
  answers: PerformanceIntakeAnswers,
  existingTitles: string[],
): { accountId: string; title: string; siteUrl: string | null }[] {
  const seen = new Set(existingTitles.map((title) => title.toLowerCase()));
  const rows: { accountId: string; title: string; siteUrl: string | null }[] =
    [];
  for (const name of answers.properties ?? []) {
    const title = name.trim();
    if (!title || seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    rows.push({ accountId, title, siteUrl: null });
  }
  return rows;
}

export { intakeBrandRef };

export const submitIntakeSchema = z.object({
  token: z.string().min(16),
  answers: z.record(z.string(), z.unknown()),
});

/**
 * Record a submission against the brand's connect token.
 *
 * The token is the whole credential, exactly as on /connect/[token] — this is
 * a public endpoint, so it must never accept an accountId or brandId from the
 * caller. The account is derived, or created in `onboarding` when a brand
 * reaches intake before anyone opened a commercial record for them.
 */
export async function submitPerformanceIntake(input: {
  token: string;
  answers: PerformanceIntakeAnswers;
}): Promise<{ intakeId: string }> {
  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.connectToken, input.token),
  });
  if (!brand?.organizationId) {
    throw new PerformanceError("NOT_FOUND", "Unknown intake link");
  }

  let account = await db.query.performanceAccountTable.findFirst({
    where: and(
      eq(performanceAccountTable.brandId, brand.id),
      isNull(performanceAccountTable.deletedAt),
    ),
  });
  if (!account) {
    const [created] = await db
      .insert(performanceAccountTable)
      .values({
        organizationId: brand.organizationId,
        brandId: brand.id,
        name: brand.name,
        website: brand.website,
        plan: "performance_plus",
        status: "onboarding",
      })
      .returning();
    account = created!;
  }

  const answers = input.answers;
  const now = new Date();
  const budgetIsRecommendation = answers.budget === "recommend";

  const [intake] = await db
    .insert(performanceIntakeTable)
    .values({
      accountId: account.id,
      brandId: brand.id,
      brandSlug: brand.slug,
      status: "submitted",
      submittedByName: brand.connectTokenIssuedByName,
      submittedByEmail: brand.connectTokenIssuedByEmail,
      answers,
      mediaBudgetDollars: budgetIsRecommendation
        ? null
        : parseBudgetDollars(answers.budget),
      budgetIsRecommendation,
      guestListConsentAt: answers.guestConsent ? now : null,
      billingAcknowledgedAt: answers.billingAcknowledged ? now : null,
      instagramLinkConfirmedAt: answers.instagramLinked ? now : null,
      accessClaimedAt: answers.accountsConnected ? now : null,
    })
    .returning({ id: performanceIntakeTable.id });

  return { intakeId: intake!.id };
}

async function requireIntake(actor: PerformanceActor, intakeId: string) {
  const intake = await db.query.performanceIntakeTable.findFirst({
    where: eq(performanceIntakeTable.id, intakeId),
    with: { account: true, brand: true },
  });
  if (intake?.account.organizationId !== actor.orgId) {
    throw new PerformanceError("NOT_FOUND", `Intake not found: ${intakeId}`);
  }
  return intake;
}

export async function listPerformanceIntakes(
  actor: PerformanceActor,
  accountId: string,
): Promise<PerformanceIntake[]> {
  const account = await db.query.performanceAccountTable.findFirst({
    where: and(
      eq(performanceAccountTable.id, accountId),
      eq(performanceAccountTable.organizationId, actor.orgId),
    ),
    columns: { id: true },
  });
  if (!account) return [];
  return db.query.performanceIntakeTable.findMany({
    where: eq(performanceIntakeTable.accountId, accountId),
    orderBy: desc(performanceIntakeTable.submittedAt),
  });
}

/** What apply would write, without writing it. */
export async function previewIntakeApply(
  actor: PerformanceActor,
  intakeId: string,
) {
  const intake = await requireIntake(actor, intakeId);
  const answers = intake.answers;

  const existing = await db.query.performancePropertyTable.findMany({
    where: and(
      eq(performancePropertyTable.accountId, intake.accountId),
      isNull(performancePropertyTable.deletedAt),
    ),
    columns: { title: true },
  });
  const newProperties = propertyRowsFromAnswers(
    intake.accountId,
    answers,
    existing.map((row) => row.title ?? ""),
  );

  const period = currentPeriod();
  const cycle = await db.query.performanceCycleTable.findFirst({
    where: and(
      eq(performanceCycleTable.accountId, intake.accountId),
      eq(performanceCycleTable.period, period),
    ),
    columns: { id: true, mediaBudget: true },
  });

  return {
    intake,
    period,
    willCreateCycle: !cycle,
    cycleId: cycle?.id ?? null,
    currentMediaBudget: cycle?.mediaBudget ?? null,
    mediaBudgetDollars: intake.mediaBudgetDollars,
    newProperties,
    // A recommendation request has no number to write, so the operator sets
    // the budget rather than apply inventing one.
    needsBudgetDecision:
      intake.budgetIsRecommendation || intake.mediaBudgetDollars === null,
    blockers: applyBlockers(intake),
  };
}

/** Why an intake cannot be applied yet. Pure so the rule is testable. */
export function applyBlockers(intake: {
  status: string;
  guestListConsentAt: Date | null;
  answers: PerformanceIntakeAnswers;
}): string[] {
  const blockers: string[] = [];
  if (intake.status === "applied") {
    blockers.push("This intake has already been applied.");
  }
  // Meta's Custom Audience terms require the attestation from the person who
  // holds the list. Uploading without it risks the shared ad account, which
  // under one account means every client, so this is a hard stop.
  if (intake.answers.guestListName && !intake.guestListConsentAt) {
    blockers.push(
      "A guest list was submitted without the consent attestation. Do not upload it.",
    );
  }
  return blockers;
}

/**
 * Promote a submission into the tables that own each fact.
 *
 * Idempotent per intake: the row flips to `applied` and blocks a second run,
 * because re-applying would re-open a cycle a human may have since adjusted.
 * Property titles are matched case-insensitively so a re-submission does not
 * duplicate homes.
 */
export async function applyPerformanceIntake(
  actor: PerformanceActor,
  input: { intakeId: string; mediaBudgetDollars?: number | null },
) {
  const preview = await previewIntakeApply(actor, input.intakeId);
  if (preview.blockers.length > 0) {
    throw new PerformanceError("BAD_REQUEST", preview.blockers.join(" "));
  }
  const intake = preview.intake;
  const answers = intake.answers;
  const written: string[] = [];

  // 1. Contact details onto the commercial record.
  const accountPatch: Record<string, unknown> = { status: "active" };
  if (answers.detailsCorrection?.trim()) {
    accountPatch.notes = [intake.account.notes, answers.detailsCorrection]
      .filter(Boolean)
      .join("\n\n");
  }
  await db
    .update(performanceAccountTable)
    .set(accountPatch)
    .where(eq(performanceAccountTable.id, intake.accountId));
  written.push("Account marked active");

  // 2. Money onto the cycle, which is what reconciliation reads.
  const budget = input.mediaBudgetDollars ?? intake.mediaBudgetDollars;
  if (budget != null) {
    if (preview.cycleId) {
      await db
        .update(performanceCycleTable)
        .set({ mediaBudget: budget })
        .where(eq(performanceCycleTable.id, preview.cycleId));
      written.push(`Set ${preview.period} media budget to $${budget}`);
    } else {
      await db.insert(performanceCycleTable).values({
        accountId: intake.accountId,
        period: preview.period,
        mediaBudget: budget,
        status: "planned",
      });
      written.push(`Opened cycle ${preview.period} at $${budget}`);
    }
  } else {
    written.push("No budget set — client asked for a recommendation");
  }

  // 3. Homes as rows, because ads fan out over them and reporting needs ids.
  if (preview.newProperties.length > 0) {
    await db.insert(performancePropertyTable).values(preview.newProperties);
    written.push(`Added ${preview.newProperties.length} home(s)`);
  }

  await db
    .update(performanceIntakeTable)
    .set({
      status: "applied",
      appliedAt: new Date(),
      appliedBy: actor.orgId,
      appliedSummary: written,
    })
    .where(eq(performanceIntakeTable.id, intake.id));

  return { intakeId: intake.id, written };
}

// ---- ACCESS VERIFICATION ---------------------------------------------------
//
// Under the shared-ad-account model the client never connects anything to
// Zernio. They grant Wander partner access through Leadsie, which lands their
// Page in Wander's Business Portfolio, and Wander's EXISTING Meta connection
// can then see it. So verification is not "did a new connection appear" but
// "can our connection now manage a Page that looks like theirs".

/** Compare Page names the way a human would: case, spacing and punctuation off. */
export function normalizePageName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Pick the Page that belongs to this brand, or nothing.
 *
 * Exact normalized equality only. A containment or prefix match would happily
 * bind "Wander" to "WanderOS", and the cost of a wrong match here is a client's
 * ads running under someone else's identity — worse than asking an operator to
 * choose from the candidates.
 */
export function matchBrandPage(
  brandName: string,
  pages: ZernioFacebookPage[],
): ZernioFacebookPage | null {
  const target = normalizePageName(brandName);
  if (!target) return null;
  const hits = pages.filter(
    (page) => page.name && normalizePageName(page.name) === target,
  );
  return hits.length === 1 ? hits[0]! : null;
}

/**
 * Ask Zernio whether the Leadsie grant actually landed.
 *
 * Always refreshes: the cached page list omits a grant made minutes ago, and a
 * false negative here sends someone chasing a client who already did their
 * part. Records the Page id when exactly one name matches, and otherwise
 * returns the candidates for a human to pick from rather than guessing.
 */
export async function verifyIntakeAccess(
  actor: PerformanceActor,
  intakeId: string,
) {
  const intake = await requireIntake(actor, intakeId);
  if (!isZernioConfigured) {
    throw new PerformanceError("BAD_REQUEST", "Zernio is not configured");
  }
  const brandName = intake.brand?.name ?? intake.account.name;

  const accounts = await listZernioAccounts();
  const metaConnections = accounts.filter((account) =>
    zernioConnectionMatchesPlatform("meta", account.platform),
  );

  const seen = new Map<string, ZernioFacebookPage>();
  const errors: string[] = [];
  for (const connection of metaConnections) {
    const connectionId = connection._id ?? connection.id;
    if (!connectionId) continue;
    try {
      const { pages } = await listZernioFacebookPages({
        accountId: connectionId,
        refresh: true,
      });
      // The same Page is visible through every connection sharing the token,
      // so dedupe by id rather than reporting it once per connection.
      for (const page of pages) seen.set(page.id, page);
    } catch (error) {
      errors.push(
        `${connection.name ?? connectionId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  const candidates = [...seen.values()];
  const match = matchBrandPage(brandName, candidates);

  if (match) {
    await db
      .update(performanceIntakeTable)
      .set({
        // Only advance an intake that has not already been applied; applied is
        // further along and must not be walked back to verified.
        status: intake.status === "applied" ? "applied" : "verified",
        zernioVerifiedAt: new Date(),
        verifiedPageId: match.id,
      })
      .where(eq(performanceIntakeTable.id, intake.id));
  }

  return {
    brandName,
    matched: match ? { id: match.id, name: match.name ?? null } : null,
    candidates: candidates.map((page) => ({
      id: page.id,
      name: page.name ?? null,
    })),
    errors,
  };
}

/** Bind a Page an operator picked when the name did not match automatically. */
export async function setIntakeVerifiedPage(
  actor: PerformanceActor,
  input: { intakeId: string; pageId: string },
) {
  const intake = await requireIntake(actor, input.intakeId);
  await db
    .update(performanceIntakeTable)
    .set({
      status: intake.status === "applied" ? "applied" : "verified",
      zernioVerifiedAt: new Date(),
      verifiedPageId: input.pageId,
    })
    .where(eq(performanceIntakeTable.id, intake.id));
  return { intakeId: intake.id, pageId: input.pageId };
}

/** Minimum gap between public access checks for one brand. */
export const ACCESS_CHECK_INTERVAL_MS = 8_000;

/** Whether a public check may run now. Pure so the throttle is testable. */
export function accessCheckAllowed(
  lastCheckAt: Date | null,
  now = new Date(),
): boolean {
  if (!lastCheckAt) return true;
  return now.getTime() - lastCheckAt.getTime() >= ACCESS_CHECK_INTERVAL_MS;
}

/**
 * The client-facing "did that work?" check, addressed by connect token.
 *
 * Reassurance only. It reports what Zernio can see and records NOTHING about
 * verification, because this route is unauthenticated and a fact we would act
 * on must not be writable by whoever holds a link. `verifyIntakeAccess` under
 * an operator session stays the only thing that stamps `zernioVerifiedAt`.
 *
 * A negative answer is never a hard failure for the client: the grant may
 * simply not have propagated, and blocking someone who did their part is a
 * worse outcome than a stale record we resolve on our side.
 */
export async function checkAccessByToken(token: string): Promise<{
  found: boolean;
  pageName: string | null;
  throttled: boolean;
}> {
  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.connectToken, token),
    columns: {
      id: true,
      name: true,
      organizationId: true,
      lastAccessCheckAt: true,
    },
  });
  if (!brand?.organizationId) {
    throw new PerformanceError("NOT_FOUND", "Unknown intake link");
  }
  if (!accessCheckAllowed(brand.lastAccessCheckAt)) {
    return { found: false, pageName: null, throttled: true };
  }
  await db
    .update(brandTable)
    .set({ lastAccessCheckAt: new Date() })
    .where(eq(brandTable.id, brand.id));

  if (!isZernioConfigured) {
    return { found: false, pageName: null, throttled: false };
  }

  const accounts = await listZernioAccounts();
  const seen = new Map<string, ZernioFacebookPage>();
  for (const connection of accounts) {
    if (!zernioConnectionMatchesPlatform("meta", connection.platform)) continue;
    const connectionId = connection._id ?? connection.id;
    if (!connectionId) continue;
    try {
      const { pages } = await listZernioFacebookPages({
        accountId: connectionId,
        refresh: true,
      });
      for (const page of pages) seen.set(page.id, page);
    } catch {
      // One unreachable connection must not fail the client's check; another
      // connection may still see the Page, and a false negative is safe here.
    }
  }

  const match = matchBrandPage(brand.name, [...seen.values()]);
  // Only the Page NAME goes back: the id is an internal handle and this
  // response is public.
  return { found: Boolean(match), pageName: match?.name ?? null, throttled: false };
}
