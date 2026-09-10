import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/server/db";
import { brandTable, userTable } from "@/server/db/schema";
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
}): Promise<{ settings: PerformanceSettings; changed: string[] }> {
  const brand = await db.query.brandTable.findFirst({
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
    const value = raw === "" ? null : raw;
    const k = key as keyof PerformanceSettingsPatch;
    if (current[k] === value || (current[k] == null && value == null)) continue;
    (next as Record<string, unknown>)[k] = value;
    changed.push(k);
  }
  if (changed.length === 0) return { settings: current, changed };

  next.updatedAt = new Date().toISOString();
  next.updatedBy = await displayName(input.by);
  next.updatedFrom = input.from;
  await db
    .update(brandTable)
    .set({ performanceSettings: next })
    .where(eq(brandTable.id, brand.id));
  return { settings: next, changed };
}

/** A user id becomes the person's name; anything else is already a name. */
async function displayName(by: string | null): Promise<string | null> {
  if (!by) return null;
  const user = await db.query.userTable.findFirst({
    where: eq(userTable.id, by),
    columns: { name: true, email: true },
  });
  return user ? (user.name ?? user.email ?? by) : by;
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
    creativeDriveUrl: clean(answers.creativeDriveUrl),
    guestListDriveUrl: clean(answers.guestListDriveUrl),
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
}): Promise<string[]> {
  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, input.brandId),
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
  });
  return changed;
}
