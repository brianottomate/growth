import "server-only";
import { generateBillingCycles } from "./billing-cycles.service";
import { provisionBrandEmail } from "./brand-email-provisioning.service";

import { and, eq, isNull } from "drizzle-orm";

import { db, withTransaction } from "@/server/db";
import { initializeBrandTasks } from "./brand-task.service";
import { ensureClientZernioProfile } from "./brand-connect.service";
import {
  brandTable,
  leadDomainTable,
  performanceAccountTable,
  type Brand,
  type BrandRelationship,
} from "@/server/db/schema";
import {
  BUSINESS_STAGES,
  DELIVERY_STAGES,
  isClientStage,
  isClosedStage,
  laterStage,
  type BusinessStage,
  type DeliveryStage,
} from "@/lib/performance-stage";
import { createOwnedBrand, normalizeWebsiteUrl } from "./brand-ops.service";
import { PerformanceError, type PerformanceActor } from "./performance.service";

// ---- RELATIONSHIP TRANSITIONS ---------------------------------------------
//
// One brand row travels the whole way: a rep picks a domain out of the leads
// mirror, pitches it, the customer signs, and the same row starts carrying
// campaigns. `brand.relationship` is what that journey moves, and the
// commercial record (`performance_account`) is created at the point money is
// agreed rather than at the point someone got interested.
//
// The leads mirror stays a mirror. Nothing here writes to it, and the link is
// the domain string, so `leads` remains droppable.

async function requireBrand(actor: PerformanceActor, brandId: string) {
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, brandId),
      eq(brandTable.organizationId, actor.orgId),
      isNull(brandTable.deletedAt),
    ),
  });
  if (!brand) throw new PerformanceError("NOT_FOUND", "Brand not found");
  return brand;
}

/** A client transition and its initial tasks commit together. */
async function saveRelationship(
  brand: Pick<Brand, "id" | "relationship">,
  changes: Partial<typeof brandTable.$inferInsert>,
  createdByUserId: string | null = null,
) {
  const updated = await withTransaction(async (tx) => {
    const [row] = await tx
      .update(brandTable)
      .set(changes)
      .where(eq(brandTable.id, brand.id))
      .returning();
    if (!row) throw new PerformanceError("NOT_FOUND", "Brand not found");
    if (brand.relationship !== "client" && row.relationship === "client")
      await initializeBrandTasks(brand.id, createdByUserId, tx);
    return row;
  });
  // Every path to client passes here. The provider call stays outside the
  // transaction and never fails the move.
  if (brand.relationship !== "client" && updated.relationship === "client")
    await ensureClientZernioProfile(brand.id);
  return updated;
}

/**
 * Create a prospect brand from a row in the leads mirror.
 *
 * Idempotent on the domain: a rep who clicks twice, or two reps working the
 * same target, get the brand that already exists rather than a duplicate with
 * a suffixed slug. Enrichment is left to the caller so the click can return
 * before a website scrape finishes.
 */
export async function createProspectFromLead(input: {
  organizationId: string;
  ownerId: string;
  domainId: string;
}): Promise<{ brand: Brand; created: boolean }> {
  const lead = await db.query.leadDomainTable.findFirst({
    where: eq(leadDomainTable.id, input.domainId),
    columns: { domain: true, companyName: true },
  });
  if (!lead) throw new PerformanceError("NOT_FOUND", "Lead not found");

  const existing = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.organizationId, input.organizationId),
      eq(brandTable.leadDomain, lead.domain),
      isNull(brandTable.deletedAt),
    ),
  });
  if (existing) return { brand: existing, created: false };

  const brand = await createOwnedBrand({
    organizationId: input.organizationId,
    ownerId: input.ownerId,
    name: lead.companyName?.trim() || lead.domain,
    website: normalizeWebsiteUrl(lead.domain),
    relationship: "prospect",
    leadDomain: lead.domain,
  });
  await advanceBusinessStage(brand.id, "prospect");
  return {
    brand: { ...brand, businessStage: "prospect" as const },
    created: true,
  };
}

/**
 * Set either lifecycle from the ⋯ dialog: any stage, including backwards.
 * The relationship follows the business stage, so the tabs and everything
 * gated on `client` agree with what the person just said.
 */
export async function setBrandStages(
  actor: PerformanceActor,
  input: {
    brandId: string;
    business?: BusinessStage;
    delivery?: DeliveryStage;
  },
): Promise<Brand> {
  const brand = await requireBrand(actor, input.brandId);
  const now = new Date();
  const business = input.business;
  const relationship =
    !business ||
    brand.relationship === "internal" ||
    brand.relationship === "reference"
      ? brand.relationship
      : isClientStage(business)
        ? "client"
        : isClosedStage(business)
          ? brand.relationship
          : "prospect";
  return saveRelationship(
    brand,
    {
      relationship,
      ...(business && business !== brand.businessStage
        ? { businessStage: business, businessStageAt: now }
        : {}),
      ...(input.delivery && input.delivery !== brand.deliveryStage
        ? { deliveryStage: input.delivery, deliveryStageAt: now }
        : {}),
    },
    actor.userId ?? null,
  );
}

/**
 * A workflow reached a business stage: move the brand there if it is further
 * along than where it stands, never backwards, never out of a closed stage.
 */
export async function advanceBusinessStage(
  brandId: string,
  stage: BusinessStage,
) {
  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, brandId),
    columns: { id: true, businessStage: true, relationship: true },
  });
  if (!brand) return;
  const current = brand.businessStage;
  if (current && isClosedStage(current)) return;
  const next = laterStage(BUSINESS_STAGES, current, stage);
  if (next === current) return;
  await saveRelationship(brand, {
    businessStage: next,
    businessStageAt: new Date(),
    ...(brand.relationship === "prospect" && isClientStage(next)
      ? { relationship: "client" as const }
      : {}),
  });
}

/** Same for delivery. Closed brands keep whatever delivery stage they ended on. */
export async function advanceDeliveryStage(
  brandId: string,
  stage: DeliveryStage,
) {
  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, brandId),
    columns: { id: true, businessStage: true, deliveryStage: true },
  });
  if (!brand) return;
  if (brand.businessStage && isClosedStage(brand.businessStage)) return;
  const next = laterStage(DELIVERY_STAGES, brand.deliveryStage, stage);
  if (next === brand.deliveryStage) return;
  await db
    .update(brandTable)
    .set({ deliveryStage: next, deliveryStageAt: new Date() })
    .where(eq(brandTable.id, brand.id));
}

/** Move a brand between relationships without touching anything else. */
export async function setBrandRelationship(
  actor: PerformanceActor,
  input: { brandId: string; relationship: BrandRelationship },
): Promise<Brand> {
  const current = await requireBrand(actor, input.brandId);
  const brand = await saveRelationship(
    current,
    { relationship: input.relationship },
    actor.userId ?? null,
  );
  // A brand that becomes a prospect starts its journey; one that becomes a
  // client without a stage is at least past the intake line.
  if (input.relationship === "prospect")
    await advanceBusinessStage(brand.id, "prospect");
  if (input.relationship === "client")
    await advanceBusinessStage(brand.id, "signed");
  return brand;
}

/**
 * The customer signed: mark the brand a client and open its commercial record.
 *
 * This is the event nothing represented before. Intake created an account as a
 * side effect of a client filling a form, which meant a signature that came
 * before the form left no trace at all.
 *
 * Idempotent, and deliberately conservative about `signedAt`: a re-run keeps
 * the first date, because the first one is the true one and a stray second
 * click should not move a contract date.
 *
 * A client also gets its email server and sending domain here, so the
 * intake's Email section has DNS records the first time they open it. A
 * Postmark failure does not undo the signature; it comes back as `email.error`
 * and a re-run picks up where it stopped.
 */
export async function promoteBrandToClient(
  actor: PerformanceActor,
  input: { brandId: string; plan?: string | null; signedAt?: Date | null },
): Promise<{ accountId: string; created: boolean; email: PromotionEmail }> {
  const result = await openClientAccount(actor, input);
  const email = await provisionBrandEmail(input.brandId).catch(
    (error: unknown) => ({
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  return { ...result, email };
}

type PromotionEmail =
  | { serverId: number; sendingDomain: string | null }
  | { error: string };

async function openClientAccount(
  actor: PerformanceActor,
  input: { brandId: string; plan?: string | null; signedAt?: Date | null },
): Promise<{ accountId: string; created: boolean }> {
  const brand = await requireBrand(actor, input.brandId);
  const signedAt = input.signedAt ?? new Date();

  await saveRelationship(
    brand,
    { relationship: "client" },
    actor.userId ?? null,
  );
  await advanceBusinessStage(brand.id, "signed");

  const existing = await db.query.performanceAccountTable.findFirst({
    where: and(
      eq(performanceAccountTable.brandId, brand.id),
      isNull(performanceAccountTable.deletedAt),
    ),
    columns: { id: true, signedAt: true },
  });

  if (existing) {
    await db
      .update(performanceAccountTable)
      .set({
        status: "active",
        signedAt: existing.signedAt ?? signedAt,
        ...(input.plan ? { plan: input.plan } : {}),
      })
      .where(eq(performanceAccountTable.id, existing.id));
    await generateBillingCycles({ orgId: actor.orgId, accountId: existing.id });
    return { accountId: existing.id, created: false };
  }

  const [account] = await db
    .insert(performanceAccountTable)
    .values({
      organizationId: actor.orgId,
      brandId: brand.id,
      name: brand.name,
      website: brand.website,
      plan: input.plan ?? "performance_plus",
      status: "active",
      signedAt,
      monthlyFee: brand.performanceSettings?.monthlyFee ?? null,
      agreedAdSpend: brand.performanceSettings?.agreedAdSpend ?? null,
      clientMediaContribution: brand.performanceSettings?.agreedAdSpend ?? null,
      effectiveDate:
        brand.performanceSettings?.effectiveDate ||
        signedAt.toISOString().slice(0, 10),
      terms: brand.performanceSettings?.terms ?? null,
      endDate: brand.performanceSettings?.endDate || null,
    })
    .returning({ id: performanceAccountTable.id });
  await generateBillingCycles({ orgId: actor.orgId, accountId: account!.id });
  return { accountId: account!.id, created: true };
}
