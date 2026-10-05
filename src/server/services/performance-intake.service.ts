import { validIntakeUrl } from "./performance-settings.service";
import {
  STANDARD_PITCH_DEFAULTS,
  publicPitchSettings,
  selectPitchHomes,
  resolvePitchFields,
  pitchFieldsSchema,
} from "@/lib/pitch-settings";
import "server-only";
import { makePrimaryGroup, sourceGroup } from "./home-groups.service";
import {
  appliedEvidenceSchema,
  type AppliedEvidence,
} from "@/lib/applied-evidence";

import {
  advanceBusinessStage,
  advanceDeliveryStage,
} from "./brand-relationship.service";

import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";

import { getPitchWorkspace } from "./pitch-workspace.service";
import { db, withTransaction } from "@/server/db";
import { listAllBrandHomes, listBrandHomes } from "./homes.service";
import { fillSettingsFromIntake } from "./performance-settings.service";
import {
  brandTable,
  homeGroupMemberTable,
  performanceAccountTable,
  performanceCycleTable,
  performanceIntakeTable,
  performancePropertyTable,
  type AudienceGeographyPlan,
  type PerformanceIntake,
  type PerformanceIntakeAnswers,
} from "@/server/db/schema";

import { zernioConnectionMatchesPlatform } from "@/lib/zernio-ads";
import {
  geographyByLookup,
  resolveGeography,
  type ResolvedGeography,
} from "@/server/services/geography-resolve.service";
import {
  brandListings,
  normalizeListingUrl,
} from "@/server/services/wanderos-listings.service";
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
// into the tables that own each fact: contact on the account, money on the
// cycle, homes in the featured group and aligned performance_property rows. After that the
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
 * The listings the client picked, as property rows.
 *
 * Intake collects URLs now, so `siteUrl` is populated rather than left null
 * for someone to match up later. Deduped on the URL, case- and trailing-slash
 * insensitively, so a resubmission does not double a home up.
 *
 * `allProperties` produces no rows on purpose. "Advertise everything" is an
 * instruction to the operator, not a list we can invent, and inventing one
 * would put homes on the record the client never named.
 */
export function propertyRowsFromAnswers(
  accountId: string,
  answers: PerformanceIntakeAnswers,
  existingUrls: string[],
): { accountId: string; siteUrl: string; title: string | null }[] {
  const normalize = (url: string) =>
    url.trim().toLowerCase().replace(/\/+$/, "");
  const seen = new Set(existingUrls.map(normalize));
  const rows: { accountId: string; siteUrl: string; title: string | null }[] =
    [];
  for (const raw of answers.propertyUrls ?? []) {
    const siteUrl = raw.trim();
    const key = normalize(siteUrl);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    rows.push({ accountId, siteUrl, title: null });
  }
  return rows;
}

export type PropertyAddress = {
  city: string | null;
  state: string | null;
  country: string | null;
};

/**
 * Attach each home's city and state from the client's own listing feed.
 *
 * Best-effort by design: an unreachable site or a home pasted by hand leaves
 * the columns null, and the campaign audience simply gets a thinner geography
 * layer. Guessing a location from a URL would put a place on the record that
 * the client never said.
 */
export function withPropertyAddresses<T extends { siteUrl: string }>(
  rows: T[],
  addresses: Map<string, PropertyAddress>,
): (T & PropertyAddress)[] {
  return rows.map((row) => ({
    ...row,
    ...(addresses.get(normalizeListingUrl(row.siteUrl)) ?? {
      city: null,
      state: null,
      country: null,
    }),
  }));
}

/**
 * The campaign audience's geography, rolled up from where the homes are.
 *
 * `states` carries the codes the feed gave us and `regions` the names a
 * platform can be asked for, so a code we cannot name drops out of `regions`
 * and stays visible in `states`. Cities come along because a metro layer is
 * sometimes the right buy, and the operator prunes.
 */
export function geographyFromProperties(
  rows: {
    city?: string | null;
    state?: string | null;
    country?: string | null;
  }[],
): AudienceGeographyPlan {
  // The deterministic pass, kept for callers that cannot await a model and as
  // the fallback inside `resolveGeography`. Prefer the async resolver: our own
  // feed states one place several ways and a lookup only fixes what it knows.
  return geographyByLookup(rows);
}

export const submitIntakeSchema = z
  .object({
    token: z.string().min(16).optional(),
    slug: z.string().min(1).max(200).optional(),
    // Preserve new questions while validating the fields downstream code consumes.
    answers: z
      .object({
        propertyUrls: z
          .array(z.string().trim().min(1).max(2000))
          .max(1000)
          .optional(),
        allProperties: z.boolean().optional(),
        detailsConfirmed: z.boolean().optional(),
        billingAcknowledged: z.boolean().optional(),
        accountsConnected: z.boolean().optional(),
        budget: z.string().max(200).optional(),
        reportEmails: z.string().max(4000).optional(),
        invoiceEmail: z.string().max(4000).optional(),
        ugcPermission: z.string().max(4000).optional(),
        creativeDriveUrl: z.string().max(4000).optional(),
        guestListDriveUrl: z.string().max(4000).optional(),
        propertyNotes: z.string().max(20000).optional(),
        anythingElse: z.string().max(20000).optional(),
        contactName: z.string().max(500).optional(),
        contactEmail: z.string().max(500).optional(),
      })
      .catchall(z.unknown()),
  })
  .refine((value) => Boolean(value.token ?? value.slug), {
    message: "A token or a slug is required",
  });

/**
 * Record a submission against the brand's connect token.
 *
 * Addressed by token or slug, never by an id from the caller: this is reached
 * from a public form, so the account is derived rather than supplied, or
 * created in `onboarding` when a brand reaches intake before anyone opened a
 * commercial record for them.
 *
 * A slug can be guessed, so a submission is a claim rather than proof of who
 * filed it. That is why apply is an operator step with a preview, and why
 * nothing here marks the access verified.
 */
export async function submitPerformanceIntake(input: {
  token?: string;
  slug?: string;
  answers: PerformanceIntakeAnswers;
}): Promise<{ intakeId: string }> {
  const { brand } = await brandForHandle(input);

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
      submittedByName:
        typeof answers.contactName === "string"
          ? answers.contactName.trim() || null
          : null,
      submittedByEmail:
        typeof answers.contactEmail === "string"
          ? answers.contactEmail.trim() || null
          : null,
      answers,
      mediaBudgetDollars: budgetIsRecommendation
        ? null
        : parseBudgetDollars(answers.budget),
      budgetIsRecommendation,
      guestListConsentAt: answers.guestConsent ? now : null,
      billingAcknowledgedAt: answers.billingAcknowledged ? now : null,
      accessClaimedAt: answers.accountsConnected ? now : null,
    })
    .returning({ id: performanceIntakeTable.id });

  // Filing the form is the moment they stop being a prospect. Until now an
  // operator had to promote them by hand, and everything gated on `client` —
  // the campaign draft's budget and landing-URL prefill above all — stayed
  // off in the meantime, so the first campaign was built by retyping numbers
  // the client had already given us.
  //
  // Only from `prospect`: `internal` is Wander's own brands and `reference`
  // is a stand-in, and neither becomes a customer by someone opening a form.
  //
  // Deliberately NOT touching the account's `status` or `signedAt`. Money is
  // tracked separately, and `signedAt` is a contract date that cohort reports
  // are built from — an intake submission is not a signature.
  // The business stage moves with the relationship, or the brand stays on
  // the Prospects tab while everything else treats it as a client.
  await advanceDeliveryStage(brand.id, "intake_submitted");
  if (brand.relationship === "prospect")
    await advanceBusinessStage(brand.id, "signed");

  return { intakeId: intake!.id };
}

/**
 * The client's own contact details for the form, or nulls.
 *
 * Only ever from the commercial record. `brand.connectTokenIssuedBy*` is the
 * WANDER rep who minted the link, and using it as a fallback here put their
 * name and email in the client's "is this still right?" box on any brand
 * without a performance_account. Null means the form asks, which is the right
 * answer when we do not know.
 *
 * Withheld entirely from a slug link, because a guessable URL should not
 * hand out an email address.
 */
export function prefillContact(
  byToken: boolean,
  account: { contactName: string | null; contactEmail: string | null } | null,
): { contact: string | null; email: string | null } {
  if (!byToken) return { contact: null, email: null };
  return {
    contact: account?.contactName ?? null,
    email: account?.contactEmail ?? null,
  };
}

/**
 * Resolve a brand from either handle the client-facing form is addressed by.
 *
 * A token is unguessable and identifies one brand. A slug is readable, so it
 * is what goes in a link someone reads out loud, and it is guessable by
 * design. `byToken` tells the caller which one it got, because the answer
 * decides what is safe to put on the page.
 */
async function brandForHandle(handle: { token?: string; slug?: string }) {
  const columns = {
    id: true,
    name: true,
    slug: true,
    website: true,
    logo: true,
    tagline: true,
    connectTokenIssuedByName: true,
    connectTokenIssuedByEmail: true,
    organizationId: true,
    // The favicon here is the only square mark we hold for most brands.
    websiteMeta: true,

    // Read so submission can promote a prospect. Never put on a payload: the
    // pitch and prefill responses are built field by field and reach a page
    // addressed by a guessable slug.
    relationship: true,
  } as const;

  if (handle.token) {
    const brand = await db.query.brandTable.findFirst({
      where: and(
        eq(brandTable.connectToken, handle.token),
        isNull(brandTable.deletedAt),
      ),
      columns,
    });
    // Restated in the return type: the null check does not survive the
    // function boundary, and callers insert with organizationId.
    if (brand?.organizationId) {
      return {
        brand: { ...brand, organizationId: brand.organizationId },
        byToken: true,
      };
    }
  }
  if (handle.slug) {
    const brand = await db.query.brandTable.findFirst({
      where: and(
        eq(brandTable.slug, handle.slug),
        isNotNull(brandTable.organizationId),
        isNull(brandTable.deletedAt),
      ),
      columns,
    });
    if (brand?.organizationId) {
      return {
        brand: { ...brand, organizationId: brand.organizationId },
        byToken: false,
      };
    }
  }
  throw new PerformanceError("NOT_FOUND", "Unknown intake link");
}

/**
 * Everything the client-facing form needs to render.
 *
 * Read-only and deliberately narrow: this crosses a repo boundary onto a
 * public page, so it returns the fields the form displays and nothing else.
 * No ids, no commercial state, no billing.
 *
 * A slug-addressed link is guessable, so it gets only what is already on the
 * client's own public booking site: their name, their domain, their homes. The
 * contact name and email come back for a token link and not for a slug one,
 * and the form asks for them instead. Same form either way; the readable URL
 * just costs two fields.
 */
export async function intakePrefill(handle: { token?: string; slug?: string }) {
  const { brand, byToken } = await brandForHandle(handle);

  const account = await db.query.performanceAccountTable.findFirst({
    where: and(
      eq(performanceAccountTable.brandId, brand.id),
      isNull(performanceAccountTable.deletedAt),
    ),
    columns: { id: true, contactName: true, contactEmail: true },
  });

  const properties = await listBrandHomes(brand.id);

  return {
    brand: brand.name,
    slug: brand.slug,
    ...prefillContact(byToken, account ?? null),
    site: brand.website,
    // URLs, because that is what the form collects and pre-ticks.
    properties: properties
      .map((row) => row.url)
      .filter((url): url is string => Boolean(url)),
    repName: brand.connectTokenIssuedByName?.split(" ")[0] ?? null,
    repEmail: brand.connectTokenIssuedByEmail,
  };
}

/**
 * The homes on the client's booking site, for the intake form to offer.
 *
 * `supported: false` covers every reason we cannot list them — no website on
 * the brand, not a WanderOS site, the search unreachable — because the form's
 * response to all of those is the same: fall back to pasting URLs. Reporting
 * them separately would be detail nobody acts on.
 */
export async function intakeListings(handle: {
  token?: string;
  slug?: string;
}): Promise<{ supported: boolean; listings: WanderOsListingSummary[] }> {
  const { brand } = await brandForHandle(handle);
  const listings = await brandListings(brand);
  return {
    supported: listings.length > 0,
    listings: listings.map((row) => ({
      name: row.name,
      url: row.url,
      bedrooms: row.bedrooms ?? null,
      imageUrl: row.imageUrl ?? null,
    })),
  };
}

/**
 * Where each home on a client's booking site is, keyed by listing URL.
 *
 * Returns an empty map for anything that is not a WanderOS site, and swallows
 * a failed fetch: an address layer is an improvement on the property rows, not
 * a precondition for writing them.
 */
export async function listingAddressMap(brand: {
  id: string;
  website: string | null;
}): Promise<Map<string, PropertyAddress>> {
  const addresses = new Map<string, PropertyAddress>();
  for (const listing of await brandListings(brand)) {
    addresses.set(normalizeListingUrl(listing.url), {
      city: listing.city ?? null,
      state: listing.state ?? null,
      country: listing.country ?? null,
    });
  }
  return addresses;
}

export type WanderOsListingSummary = {
  name: string;
  url: string;
  bedrooms: number | null;
  /** First media on the listing, so the form can show what it is. */
  imageUrl: string | null;
};

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
  accountId?: string,
): Promise<PerformanceIntake[]> {
  const accounts = db
    .select({ id: performanceAccountTable.id })
    .from(performanceAccountTable)
    .where(
      and(
        eq(performanceAccountTable.organizationId, actor.orgId),
        isNull(performanceAccountTable.deletedAt),
        accountId !== undefined
          ? eq(performanceAccountTable.id, accountId)
          : undefined,
      ),
    );
  return db.query.performanceIntakeTable.findMany({
    where: inArray(performanceIntakeTable.accountId, accounts),
    orderBy: desc(performanceIntakeTable.submittedAt),
  });
}

/** Resolve only this brand's catalog; never guess or silently drop requested homes. */
export function intakeHomeSelection<
  T extends { id: string; name: string; url: string },
>(
  answers: PerformanceIntakeAnswers,
  catalog: T[],
): { homes: T[]; blockers: string[] } {
  if (answers.allProperties)
    return {
      homes: catalog,
      blockers: catalog.length
        ? []
        : ["Sync the brand's homes before applying this intake."],
    };
  const requested = [
    ...new Set(
      (answers.propertyUrls ?? []).map(normalizeListingUrl).filter(Boolean),
    ),
  ];
  const homes = requested.flatMap((url) =>
    catalog.filter((home) => normalizeListingUrl(home.url) === url).slice(0, 1),
  );
  const unmatched = requested.filter(
    (url) => !homes.some((home) => normalizeListingUrl(home.url) === url),
  );
  return {
    homes,
    blockers: [
      ...(requested.length
        ? []
        : ["Select homes before applying this intake."]),
      ...(unmatched.length
        ? [
            `${unmatched.length} selected home(s) could not be matched to this brand's catalog. Sync or add them first.`,
          ]
        : []),
    ],
  };
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
    columns: { siteUrl: true },
  });
  const catalog = intake.brand ? await listAllBrandHomes(intake.brand.id) : [];
  const selection = intakeHomeSelection(answers, catalog);
  const featuredHomes = selection.homes.map((home) => ({
    id: home.id,
    name: home.name,
    url: home.url,
  }));
  const newProperties: {
    accountId: string;
    siteUrl: string;
    title: string | null;
  }[] = selection.homes
    .filter(
      (home) =>
        !existing.some(
          (row) =>
            normalizeListingUrl(row.siteUrl ?? "") ===
            normalizeListingUrl(home.url),
        ),
    )
    .map((home) => ({
      accountId: intake.accountId,
      siteUrl: home.url,
      title: home.name,
    }));

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
    featuredHomes,
    // A recommendation request has no number to write, so the operator sets
    // the budget rather than apply inventing one.
    needsBudgetDecision:
      intake.budgetIsRecommendation || intake.mediaBudgetDollars === null,
    blockers: [
      ...applyBlockers(intake),
      ...selection.blockers,
      ...(!intake.brand
        ? ["Link this intake to a brand before applying it."]
        : []),
    ],
  };
}

/**
 * Why an intake cannot be applied yet.
 *
 * Only one rule left: an intake applies once. Everything apply writes lands in
 * the commercial tables and nothing reaches a platform, so there is no reason
 * to refuse a submission on its contents. Consent for a guest audience is no
 * longer asked on the form, and building one is an operator action with its
 * own approval rather than something this gate can vouch for.
 *
 * Pure so the rule stays testable.
 */
export function applyBlockers(intake: { status: string }): string[] {
  return intake.status === "applied"
    ? ["This intake has already been applied."]
    : [];
}

/**
 * Promote a submission into the tables that own each fact.
 *
 * Idempotent per intake: the row flips to `applied` and blocks a second run,
 * because re-applying would re-open a cycle a human may have since adjusted.
 * Selected catalog homes replace the featured group; existing campaigns remain snapshots.
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
  const applied: AppliedEvidence["applied"] = [];
  const record = (
    targetType: AppliedEvidence["applied"][number]["targetType"],
    targetId: string,
    patch: Record<string, unknown>,
  ) => {
    for (const [field, value] of Object.entries(patch))
      if (value !== undefined)
        applied.push({
          targetType,
          targetId,
          field,
          value: JSON.parse(
            JSON.stringify(value),
          ) as AppliedEvidence["applied"][number]["value"],
        });
  };

  return withTransaction(async (tx) => {
    // Serialize applications for this account, including duplicate submissions.
    await tx
      .select()
      .from(performanceAccountTable)
      .where(eq(performanceAccountTable.id, intake.accountId))
      .for("update");
    const [currentIntake] = await tx
      .select()
      .from(performanceIntakeTable)
      .where(eq(performanceIntakeTable.id, intake.id))
      .for("update");
    if (currentIntake?.status === "applied")
      throw new PerformanceError(
        "BAD_REQUEST",
        "This intake has already been applied.",
      );
    const [currentAccount] = await tx
      .select()
      .from(performanceAccountTable)
      .where(eq(performanceAccountTable.id, intake.accountId));

    // 1. Contact details onto the commercial record. The free-text corrections
    //    field is gone from the form (an AE handles those), so what carries over
    //    is the notes the client did leave plus where their assets live.
    const accountPatch: Record<string, unknown> = { status: "active" };
    const noteLines = [
      answers.propertyNotes?.trim(),
      answers.anythingElse?.trim(),
      answers.creativeDriveUrl?.trim() &&
        `Creative: ${answers.creativeDriveUrl.trim()}`,
      answers.guestListDriveUrl?.trim() &&
        `Guest list: ${answers.guestListDriveUrl.trim()}`,
      answers.allProperties ? "Client asked for ALL properties." : undefined,
    ].filter((line): line is string => Boolean(line));
    if (noteLines.length > 0) {
      accountPatch.notes = [currentAccount?.notes, ...noteLines]
        .filter(Boolean)
        .join("\n\n");
    }
    await tx
      .update(performanceAccountTable)
      .set(accountPatch)
      .where(eq(performanceAccountTable.id, intake.accountId));
    record("account", intake.accountId, accountPatch);
    written.push("Account marked active");

    // 2. Money onto the cycle, which is what reconciliation reads.
    const budget = input.mediaBudgetDollars ?? intake.mediaBudgetDollars;
    const currentCycle = await tx.query.performanceCycleTable.findFirst({
      where: and(
        eq(performanceCycleTable.accountId, intake.accountId),
        eq(performanceCycleTable.period, preview.period),
      ),
      columns: { id: true },
    });
    if (budget != null) {
      if (currentCycle) {
        await tx
          .update(performanceCycleTable)
          .set({ mediaBudget: budget })
          .where(eq(performanceCycleTable.id, currentCycle.id));
        record("cycle", currentCycle.id, { mediaBudget: budget });
        written.push(`Set ${preview.period} media budget to $${budget}`);
      } else {
        const [createdCycle] = await tx
          .insert(performanceCycleTable)
          .values({
            accountId: intake.accountId,
            period: preview.period,
            mediaBudget: budget,
            status: "planned",
          })
          .returning();
        if (createdCycle)
          record("cycle", createdCycle.id, {
            period: preview.period,
            mediaBudget: budget,
            status: "planned",
          });
        written.push(`Opened cycle ${preview.period} at $${budget}`);
      }
    } else {
      written.push("No budget set, client asked for a recommendation");
    }

    // The client's picks get their own group, which becomes primary. Our
    // suggestion stays beside it; existing campaigns keep their snapshots.
    const brandId = intake.brand!.id;
    const group = await sourceGroup(tx, brandId, "intake");
    await tx
      .delete(homeGroupMemberTable)
      .where(eq(homeGroupMemberTable.groupId, group.id));
    if (preview.featuredHomes.length)
      await tx.insert(homeGroupMemberTable).values(
        preview.featuredHomes.map((home, sortOrder) => ({
          groupId: group.id,
          homeId: home.id,
          sortOrder,
        })),
      );
    await makePrimaryGroup(tx, brandId, group.id);
    record("brand", brandId, {
      featuredHomeIds: preview.featuredHomes.map((home) => home.id),
    });
    written.push(
      `Set ${group.name} to ${preview.featuredHomes.length} selected home(s) and made it primary`,
    );

    // Keep commercial property rows aligned, retaining history via soft deletion.
    const selectedUrls = preview.featuredHomes.map((home) =>
      normalizeListingUrl(home.url),
    );
    const oldProperties = await tx.query.performancePropertyTable.findMany({
      where: and(
        eq(performancePropertyTable.accountId, intake.accountId),
        isNull(performancePropertyTable.deletedAt),
      ),
    });
    const removed = oldProperties.filter(
      (row) => !selectedUrls.includes(normalizeListingUrl(row.siteUrl ?? "")),
    );
    if (removed.length)
      await tx
        .update(performancePropertyTable)
        .set({ deletedAt: new Date() })
        .where(
          inArray(
            performancePropertyTable.id,
            removed.map((row) => row.id),
          ),
        );
    const homes = await listAllBrandHomes(brandId);
    for (const selected of preview.featuredHomes) {
      if (
        oldProperties.some(
          (row) =>
            normalizeListingUrl(row.siteUrl ?? "") ===
            normalizeListingUrl(selected.url),
        )
      )
        continue;
      const home = homes.find((row) => row.id === selected.id)!;
      const [added] = await tx
        .insert(performancePropertyTable)
        .values({
          accountId: intake.accountId,
          title: home.name,
          siteUrl: home.url,
          city: home.city,
          state: home.state,
          country: home.country,
        })
        .returning();
      if (added)
        record("property", added.id, {
          title: added.title,
          siteUrl: added.siteUrl,
          city: added.city,
          state: added.state,
        });
    }

    // 4. Settings onto the brand, filling only what is still empty: the
    //    receipt never overwrites a deliberate edit. Replacing one is the
    //    agent's call, made with the explicit settings verb.
    if (intake.brand) {
      const filled = await fillSettingsFromIntake({
        brandId: intake.brand.id,
        orgId: actor.orgId,
        answers,
        client: tx,
      });
      if (filled.length > 0) {
        const updated = await tx.query.brandTable.findFirst({
          where: eq(brandTable.id, intake.brand.id),
          columns: { performanceSettings: true },
        });
        const settings = updated?.performanceSettings as Record<
          string,
          unknown
        > | null;
        for (const field of filled)
          record("brand", intake.brand.id, {
            [`performanceSettings.${field}`]: settings?.[field] ?? null,
          });
        written.push(`Settings filled: ${filled.join(", ")}`);
      }
    }

    await tx
      .update(performanceIntakeTable)
      .set({
        status: "applied",
        appliedAt: new Date(),
        appliedBy: actor.orgId,
        appliedSummary: written,
      })
      .where(eq(performanceIntakeTable.id, intake.id));

    const evidence: AppliedEvidence["evidence"] = [
      {
        sourceType: "intake",
        sourceId: intake.id,
        sourceUrl: null,
        observedAt: new Date().toISOString(),
        method: "client-submission",
      },
    ];
    if (input.mediaBudgetDollars != null)
      evidence.push({
        sourceType: "operator",
        sourceId: actor.orgId,
        sourceUrl: null,
        observedAt: new Date().toISOString(),
        method: "operator-override",
      });
    return {
      intakeId: intake.id,
      written,
      ...appliedEvidenceSchema.parse({ evidence, applied }),
    };
  });
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
 * ads running under someone else's identity, which is worse than asking an
 * operator to choose from the candidates.
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
  // The Page list hangs off the Facebook account; its metaads sibling shares
  // the token but answers 404 on the pages endpoint, so asking it only adds
  // a spurious error to every check.
  const metaConnections = accounts.filter(
    (account) =>
      account.platform.toLowerCase() === "facebook" ||
      (zernioConnectionMatchesPlatform("meta", account.platform) &&
        account.platform.toLowerCase() !== "metaads"),
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
    if (intake.brandId) {
      await bindBrandPage(intake.brandId, match.id);
    }
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

/**
 * The verified Page becomes the brand's delivery identity. The intake keeps
 * its own copy as the record of the check; the brand column is what the push
 * and the connect flow read, so a brand verified once stays bound even after
 * the intake is re-submitted.
 */
async function bindBrandPage(brandId: string, pageId: string) {
  await db
    .update(brandTable)
    .set({ metaPageId: pageId })
    .where(eq(brandTable.id, brandId));
  await advanceDeliveryStage(brandId, "access_verified");
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
export async function checkAccessByToken(handle: {
  token?: string;
  slug?: string;
}): Promise<{
  found: boolean;
  pageName: string | null;
  throttled: boolean;
}> {
  const { brand: resolved } = await brandForHandle(handle);
  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, resolved.id),
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
  return {
    found: Boolean(match),
    pageName: match?.name ?? null,
    throttled: false,
  };
}

// ---- THE PITCH PAGE --------------------------------------------------------
//
// A rep sends a prospect a readable link before anything is signed. The page
// is on wander.com and reads through the gateway, so this is the one place
// that decides what a guessable URL may show: the brand's own public identity
// and the homes already listed on their own booking site. No commercial
// state, no contact details, no ids.

/** Edge of the square mark we ask a WanderOS image proxy for. */
const ICON_EDGE = 256;

/**
 * The brand's best square mark.
 *
 * WanderOS serves site images through `/i/width=..,height=..` and the favicon
 * we stored asks for 32px, which is a browser-tab icon rendered into a
 * 96px avatar. The proxy honours whatever the URL asks for and the underlying
 * file is full size, so the numbers are rewritten rather than the image
 * re-fetched. Anything not in that shape is passed through untouched.
 */
export function squareBrandMark(brand: {
  logo: string | null;
  websiteMeta: { favicon?: string } | null;
}): string | null {
  const source = brand.websiteMeta?.favicon ?? brand.logo;
  if (!source) return null;
  return source.replace(
    /\/i\/width=\d+,height=\d+/,
    `/i/width=${ICON_EDGE},height=${ICON_EDGE}`,
  );
}

export type PerformancePitchHome = {
  name: string;
  url: string;
  imageUrl: string | null;
  bedrooms: number | null;
  city: string | null;
  state: string | null;
};

export type PerformancePitch = {
  defaults: typeof STANDARD_PITCH_DEFAULTS;
  settings: ReturnType<typeof publicPitchSettings>;
  resolved: ReturnType<typeof resolvePitchFields> & { revision: number };
  brand: {
    name: string;
    website: string | null;
    logo: string | null;
    /**
     * Square mark for round avatars, separate from the lockup. A WanderOS
     * favicon is served through the site's image proxy at whatever size the
     * URL asks for, and the stored one asks for 32px — fine for a browser tab
     * and useless in an ad mockup — so the request is widened.
     */
    icon: string | null;
    tagline: string | null;
  };
  homes: PerformancePitchHome[];
  /**
   * Rolled up from the homes, so the pitch can say where the ads would run.
   * Carries `markets` too, which is the line a person actually reads.
   */
  geography: ResolvedGeography;
  /** Where the same link takes them once they say yes. */
  intakePath: string;
};

export async function performancePitch(handle: {
  token?: string;
  slug?: string;
}): Promise<PerformancePitch> {
  const { brand } = await brandForHandle(handle);

  // A pitch page with no homes is still a pitch page, which is what an empty
  // list from here means.
  const allHomes: PerformancePitchHome[] = (await brandListings(brand)).map(
    (row) => ({
      name: row.name,
      url: row.url,
      imageUrl: row.imageUrl ?? null,
      bedrooms: row.bedrooms ?? null,
      city: row.city ?? null,
      state: row.state ?? null,
    }),
  );

  const workspace = await getPitchWorkspace(brand.organizationId, brand.id);
  const settings = workspace.pitchSettings;
  const homes = selectPitchHomes(allHomes, settings?.selectedHomeUrls ?? []);
  const geography = await resolveGeography(homes);
  const location =
    [geography.markets, geography.cities, geography.states, geography.countries]
      .find((places) => places?.length)
      ?.slice(0, 3)
      .join(", ") ?? "";

  return {
    defaults: STANDARD_PITCH_DEFAULTS,
    settings: publicPitchSettings(settings),
    resolved: {
      ...resolvePitchFields(
        pitchFieldsSchema.parse(settings ?? {}),
        { name: brand.name, logo: brand.logo, icon: squareBrandMark(brand) },
        location,
      ),
      revision: settings?.revision ?? 0,
    },
    brand: {
      name: brand.name,
      website: brand.website,
      logo: brand.logo,
      icon: squareBrandMark(brand),
      tagline: brand.tagline,
    },
    homes,
    geography,
    // The slug, never the token: this payload can reach a guessable page.
    intakePath: brand.slug ? `/internal/intake/${brand.slug}` : "",
  };
}

// ---- CAMPAIGN PREFILL -----------------------------------------------------

export type CampaignPrefill = {
  accountId: string | null;
  /** Whole dollars the client agreed to, or null when they asked us to advise. */
  mediaBudgetDollars: number | null;
  landingUrl: string | null;
  /** The homes on the record, which is what the ads fan out over. */
  propertyUrls: string[];
  /** True when the client asked for everything rather than naming homes. */
  allProperties: boolean;
  geography: AudienceGeographyPlan;
};

/**
 * What a new campaign draft should open with for a Performance client.
 *
 * Reads the promoted rows rather than the receipt wherever both exist, since
 * an operator may have corrected a home or a budget after apply. The budget
 * falls back to the intake's own number when no cycle has been opened yet.
 */
export async function campaignPrefillFromIntake(
  actor: PerformanceActor,
  input: { brandId: string },
): Promise<CampaignPrefill> {
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, input.brandId),
      eq(brandTable.organizationId, actor.orgId),
    ),
    columns: { id: true, website: true },
  });
  if (!brand) throw new PerformanceError("NOT_FOUND", "Brand not found");

  const account = await db.query.performanceAccountTable.findFirst({
    where: and(
      eq(performanceAccountTable.brandId, brand.id),
      eq(performanceAccountTable.organizationId, actor.orgId),
      isNull(performanceAccountTable.deletedAt),
    ),
    columns: { id: true },
  });
  if (!account) {
    return {
      accountId: null,
      mediaBudgetDollars: null,
      landingUrl: brand.website,
      propertyUrls: [],
      allProperties: false,
      geography: {},
    };
  }

  const [intake, properties, cycle] = await Promise.all([
    db.query.performanceIntakeTable.findFirst({
      where: and(
        eq(performanceIntakeTable.accountId, account.id),
        eq(performanceIntakeTable.status, "applied"),
      ),
      orderBy: desc(performanceIntakeTable.submittedAt),
      columns: { answers: true, mediaBudgetDollars: true },
    }),
    listBrandHomes(brand.id),
    db.query.performanceCycleTable.findFirst({
      where: and(
        eq(performanceCycleTable.accountId, account.id),
        eq(performanceCycleTable.period, currentPeriod()),
      ),
      columns: { mediaBudget: true },
    }),
  ]);

  return {
    accountId: account.id,
    mediaBudgetDollars: cycle?.mediaBudget ?? null,
    landingUrl: brand.website,
    propertyUrls: properties
      .map((row) => row.url)
      .filter((url): url is string => Boolean(url)),
    allProperties: intake?.answers.allProperties === true,
    geography: await resolveGeography(properties),
  };
}
