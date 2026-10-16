import { readPaymentSettings } from "./performance-payment-state";
import { queuePerformanceStageNotification } from "./performance-stage-notification.service";
import { pipelineStage } from "@/lib/performance-pipeline";
import "server-only";
import { manualBillingPatchSchema } from "@/lib/manual-billing";
import { intakeEmailPreferencesSchema } from "@/lib/intake-email-preferences";
import { currentPeriod } from "@/lib/performance-billing";

import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { STORED_PIPELINE_STAGES } from "@/lib/performance-pipeline";
import {
  performanceCardStateSchema,
  performanceAmountSchema,
  mergePerformanceCardState,
} from "@/lib/performance-card-state";

import {
  db,
  withTransaction,
  type Database,
  type TransactionClient,
} from "@/server/db";
import { brandTable, userTable } from "@/server/db/schema";
import {
  writeManualBilling,
  manualBillingResult,
} from "./performance-billing.service";
import type { PerformanceSettings } from "@/server/db/brand-schema";
import type { PerformanceIntakeAnswers } from "@/server/db/performance-schema";

// A client's live settings, one JSONB on the brand. Two writers: the agent
// (or a person through it), which may patch anything, and the intake apply
// step, which only fills what is still empty so a deliberate edit is never
// undone by a receipt. The intake form itself is the client's alone.

const url = z.string().url().or(z.literal(""));
const text = z.string().max(500);

/** What a patch may carry. An empty string clears a cell; omitted keys are untouched. */
export const performanceSettingsPatchSchema = z.object({
  billing: manualBillingPatchSchema.optional(),
  note: z.string().trim().max(2000).nullish(),
  cardState: performanceCardStateSchema.nullish(),
  pipelineStage: z.enum(STORED_PIPELINE_STAGES).nullish(),
  reportEmails: text.nullish(),
  invoiceEmail: text.nullish(),
  ugcPermission: text.nullish(),
  creativeDriveUrl: url.nullish(),
  guestListDriveUrl: url.nullish(),
  catalogCreativeUrl: url.nullish(),
  carouselCreativeUrl: url.nullish(),
  heroCreativeUrl: url.nullish(),
  adCopiesUrl: url.nullish(),
  dedicatedNewsletter: text.nullish(),
  influencer: text.nullish(),
  socialMediaPosts: text.nullish(),
  bookings: z.number().int().min(0).nullish(),
  monthlyFee: performanceAmountSchema.nullish(),
  effectiveDate: z.iso.date().or(z.literal("")).nullish(),
  terms: text.nullish(),
  endDate: z.iso.date().or(z.literal("")).nullish(),
  siteLive: text.nullish(),
  agreedAdSpend: performanceAmountSchema.nullish(),
  logoOnCreatives: z.boolean().nullish(),
  emailPreferences: intakeEmailPreferencesSchema.nullish(),
});

export type PerformanceSettingsPatch = z.infer<
  typeof performanceSettingsPatchSchema
>;

export class PerformanceSettingsError extends Error {
  constructor(
    public status: 404 | 422,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Merge a patch into the brand's settings and say what changed. Every value
 * in the patch is written, including nulls; keys left out are kept. The
 * stamp records who and what wrote, so the settings page can say so.
 */
type SettingsInput = {
  brandId: string;
  orgId: string;
  patch: PerformanceSettingsPatch;
  /** A display name, or a user id to resolve to one. */
  by: string | null;
  from: NonNullable<PerformanceSettings["updatedFrom"]>;
  client?: Database | TransactionClient;
};
export async function setPerformanceSettings(input: SettingsInput) {
  return input.client
    ? writeSettings(input, input.client)
    : withTransaction((client) => writeSettings(input, client));
}
async function writeSettings(
  input: SettingsInput,
  client: Database | TransactionClient,
) {
  const brand =
    input.patch.pipelineStage !== undefined
      ? (
          await client
            .select({
              id: brandTable.id,
              relationship: brandTable.relationship,
              performanceSettings: brandTable.performanceSettings,
            })
            .from(brandTable)
            .where(
              and(
                eq(brandTable.id, input.brandId),
                eq(brandTable.organizationId, input.orgId),
                isNull(brandTable.deletedAt),
              ),
            )
            .limit(1)
            .for("update")
        )[0]
      : await client.query.brandTable.findFirst({
          where: and(
            eq(brandTable.id, input.brandId),
            eq(brandTable.organizationId, input.orgId),
            isNull(brandTable.deletedAt),
          ),
          columns: { id: true, relationship: true, performanceSettings: true },
        });
  if (!brand) throw new PerformanceSettingsError(404, "Brand not found");

  const current = brand.performanceSettings ?? {};
  const next: PerformanceSettings = { ...current };
  const changed: string[] = [];
  for (const [key, raw] of Object.entries(input.patch)) {
    if (raw === undefined || key === "billing") continue;
    const value =
      key === "cardState" && raw != null
        ? mergePerformanceCardState(
            current.cardState,
            performanceCardStateSchema.parse(raw),
          )
        : key === "note"
          ? performanceSettingsPatchSchema.shape.note.parse(raw) || null
          : raw === ""
            ? null
            : raw;
    const k = key as keyof PerformanceSettings;
    (next as Record<string, unknown>)[k] = value;
    changed.push(k);
  }
  const payment = input.patch.cardState;
  const billingPatch =
    input.patch.billing ??
    (payment?.managementPayment !== undefined ||
    payment?.spendPayment !== undefined
      ? {
          period: payment?.billingPeriod ?? currentPeriod(),
          managementPayment: payment?.managementPayment,
          spendPayment: payment?.spendPayment,
        }
      : undefined);
  const billing = billingPatch
    ? manualBillingResult(
        await writeManualBilling(
          { orgId: input.orgId },
          input.brandId,
          billingPatch,
          client,
        ),
      )
    : undefined;
  if (billingPatch) changed.push("billing");
  if (changed.length === 0) return { settings: current, changed, billing };

  next.updatedAt = new Date().toISOString();
  const editor = input.by
    ? await client.query.userTable.findFirst({
        where: eq(userTable.id, input.by),
        columns: { id: true, name: true, email: true, image: true },
      })
    : null;
  next.updatedBy = editor
    ? (editor.name ?? editor.email ?? input.by)
    : input.by;
  next.updatedFrom = input.from;
  if (changed.includes("note")) {
    next.noteEditedAt = next.updatedAt;
    next.noteEditedBy = editor
      ? {
          id: editor.id,
          name: editor.name ?? editor.email,
          image: editor.image,
        }
      : { id: null, name: input.by, image: null };
  }
  // Patch submitted facts atomically, preserving concurrent board moves and
  // edits to unrelated settings instead of replacing the read snapshot.
  const patch = Object.fromEntries(
    changed
      .filter((key) => key !== "cardState" && key !== "billing")
      .map((key) => [key, next[key as keyof PerformanceSettings]]),
  );
  if (changed.includes("pipelineStage")) patch.pipelineOrder = null;
  Object.assign(patch, {
    updatedAt: next.updatedAt,
    updatedBy: next.updatedBy,
    updatedFrom: next.updatedFrom,
  });
  if (changed.includes("note"))
    Object.assign(patch, {
      noteEditedAt: next.noteEditedAt,
      noteEditedBy: next.noteEditedBy,
    });
  let expression = sql`coalesce(${brandTable.performanceSettings}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb`;
  if (changed.includes("cardState")) {
    const state =
      input.patch.cardState == null
        ? sql`'null'::jsonb`
        : sql`(coalesce(nullif(${brandTable.performanceSettings}->'cardState', 'null'::jsonb), '{}'::jsonb) || ${JSON.stringify(Object.fromEntries(Object.entries(performanceCardStateSchema.parse(input.patch.cardState)).filter(([key]) => key !== "managementPayment" && key !== "spendPayment")))}::jsonb) - 'managementPayment' - 'spendPayment'`;
    expression = sql`jsonb_set(${expression}, '{cardState}', ${state}, true)`;
  }
  const saved = await client
    .update(brandTable)
    .set({ performanceSettings: expression })
    .where(
      and(
        eq(brandTable.id, brand.id),
        eq(brandTable.organizationId, input.orgId),
        isNull(brandTable.deletedAt),
      ),
    )
    .returning();
  if (!saved.length) throw new PerformanceSettingsError(404, "Brand not found");
  if (changed.includes("pipelineStage")) {
    await queuePerformanceStageNotification(client, {
      brandId: brand.id,
      orgId: input.orgId,
      userId: editor?.id ?? null,
      by: next.updatedBy ?? null,
      from: pipelineStage({
        relationship: brand.relationship,
        pipelineStage: current.pipelineStage,
      }),
      to: pipelineStage({
        relationship: brand.relationship,
        pipelineStage: next.pipelineStage,
      }),
    });
  }
  return {
    settings: await readPaymentSettings(
      brand.id,
      saved[0]!.performanceSettings,
      client,
    ),
    changed,
    billing,
  };
}

export function validIntakeUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

/** The settings an intake carries, as a patch; blanks are dropped, not written. */
export function settingsFromIntake(
  answers: PerformanceIntakeAnswers,
): PerformanceSettingsPatch {
  const clean = (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : undefined;
  return {
    reportEmails: clean(answers.reportEmails),
    invoiceEmail: clean(answers.invoiceEmail),
    ugcPermission: clean(answers.ugcPermission),
    creativeDriveUrl: validIntakeUrl(answers.creativeDriveUrl),
    guestListDriveUrl: validIntakeUrl(answers.guestListDriveUrl),
  };
}

/**
 * Promote an intake's settings without overwriting anything already set.
 * The client's receipt fills gaps; deciding whether it should replace an
 * existing value is the agent's call, made with the explicit patch verb.
 */
export async function fillSettingsFromIntake(input: {
  brandId: string;
  orgId: string;
  answers: PerformanceIntakeAnswers;
  client?: Database | TransactionClient;
}): Promise<string[]> {
  const client = input.client ?? db;
  const brand = await client.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, input.brandId),
      eq(brandTable.organizationId, input.orgId),
      isNull(brandTable.deletedAt),
    ),
    columns: { performanceSettings: true },
  });
  const current = brand?.performanceSettings ?? {};
  const candidate = settingsFromIntake(input.answers);
  const patch: PerformanceSettingsPatch = {};
  for (const [key, value] of Object.entries(candidate)) {
    const k = key as keyof PerformanceSettings;
    if (value === undefined) continue;
    if (current[k] != null && current[k] !== "") continue;
    (patch as Record<string, unknown>)[k] = value;
  }
  if (Object.keys(patch).length === 0) return [];
  const { changed } = await setPerformanceSettings({
    brandId: input.brandId,
    orgId: input.orgId,
    patch,
    by: "intake",
    from: "intake",
    client,
  });
  return changed;
}
