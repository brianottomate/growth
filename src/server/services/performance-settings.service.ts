import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { STORED_PIPELINE_STAGES } from "@/lib/performance-pipeline";
import {
  performanceCardStateSchema,
  performanceAmountSchema,
  mergePerformanceCardState,
} from "@/lib/performance-card-state";

import { db, type Database, type TransactionClient } from "@/server/db";
import { brandTable, userTable } from "@/server/db/schema";
import { markCycleLinePaid } from "./performance-billing.service";
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
export async function setPerformanceSettings(input: {
  brandId: string;
  orgId: string;
  patch: PerformanceSettingsPatch;
  /** A display name, or a user id to resolve to one. */
  by: string | null;
  from: NonNullable<PerformanceSettings["updatedFrom"]>;
  client?: Database | TransactionClient;
}): Promise<{ settings: PerformanceSettings; changed: string[] }> {
  const client = input.client ?? db;
  const brand = await client.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, input.brandId),
      eq(brandTable.organizationId, input.orgId),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true, performanceSettings: true },
  });
  if (!brand) throw new PerformanceSettingsError(404, "Brand not found");

  const current = brand.performanceSettings ?? {};
  const next: PerformanceSettings = { ...current };
  const changed: string[] = [];
  for (const [key, raw] of Object.entries(input.patch)) {
    if (raw === undefined) continue;
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
    const k = key as keyof PerformanceSettingsPatch;
    if (
      JSON.stringify(current[k]) === JSON.stringify(value) ||
      (current[k] == null && value == null)
    )
      continue;
    (next as Record<string, unknown>)[k] = value;
    changed.push(k);
  }
  if (changed.length === 0) return { settings: current, changed };

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
  const saved = await client
    .update(brandTable)
    .set({ performanceSettings: next })
    .where(
      and(
        eq(brandTable.id, brand.id),
        eq(brandTable.organizationId, input.orgId),
        isNull(brandTable.deletedAt),
        sql`${brandTable.performanceSettings} is not distinct from ${brand.performanceSettings == null ? null : JSON.stringify(brand.performanceSettings)}::jsonb`,
      ),
    )
    .returning();
  if (!saved.length)
    throw new PerformanceSettingsError(
      422,
      "Client settings changed while saving. Refresh and try again.",
    );
  // Paid lives on the month's billing cycle, which is what moves the brand to
  // Paid on the Clients list. The card's payment fields write through to it.
  for (const [key, line] of [
    ["managementPayment", "fee"],
    ["spendPayment", "media"],
  ] as const) {
    const was = current.cardState?.[key] === "Paid";
    const is = next.cardState?.[key] === "Paid";
    if (was !== is) {
      await markCycleLinePaid(
        { orgId: input.orgId },
        { brandId: brand.id, line, paid: is },
      );
    }
  }
  return { settings: next, changed };
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
    const k = key as keyof PerformanceSettingsPatch;
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
