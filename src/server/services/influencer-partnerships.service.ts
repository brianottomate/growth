import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { z } from "zod";
import { ORPCError } from "@orpc/server";
import { db, withTransaction } from "@/server/db";
import {
  amplifierTable,
  brandTable,
  homeTable,
  influencerPartnershipTable as partnerships,
} from "@/server/db/schema";
import {
  influencerTrackingUrl,
  partnershipSaveInput,
  type partnershipListInput,
} from "@/lib/influencer-partnerships";

export async function listInfluencerPartnerships(
  input: z.infer<typeof partnershipListInput>,
  orgId: string,
  id?: string,
) {
  const rows = await db
    .select({
      id: partnerships.id,
      amplifierId: partnerships.amplifierId,
      amplifierName: amplifierTable.name,
      brandId: partnerships.brandId,
      brandName: brandTable.name,
      homeId: partnerships.homeId,
      homeName: homeTable.name,
      checkIn: partnerships.checkIn,
      checkOut: partnerships.checkOut,
      deliverables: partnerships.deliverables,
      notes: partnerships.notes,
      website: brandTable.website,
      homeUrl: homeTable.url,
      homeDeleted: homeTable.deletedAt,
      amplifierDeleted: amplifierTable.deletedAt,
      homeBrandId: homeTable.brandId,
    })
    .from(partnerships)
    .innerJoin(
      amplifierTable,
      and(
        eq(amplifierTable.id, partnerships.amplifierId),
        eq(amplifierTable.organizationId, orgId),
      ),
    )
    .innerJoin(
      brandTable,
      and(
        eq(brandTable.id, partnerships.brandId),
        eq(brandTable.organizationId, orgId),
        isNull(brandTable.deletedAt),
        eq(brandTable.relationship, "client"),
      ),
    )
    .leftJoin(
      homeTable,
      and(
        eq(homeTable.id, partnerships.homeId),
        eq(homeTable.brandId, partnerships.brandId),
      ),
    )
    .where(
      and(
        eq(partnerships.organizationId, orgId),
        isNull(partnerships.deletedAt),
        input.brandId ? eq(partnerships.brandId, input.brandId) : undefined,
        input.amplifierId
          ? eq(partnerships.amplifierId, input.amplifierId)
          : undefined,
        id ? eq(partnerships.id, id) : undefined,
      ),
    )
    .orderBy(desc(partnerships.createdAt), desc(partnerships.id));
  return rows.map(
    ({
      website,
      homeUrl,
      homeDeleted,
      homeBrandId,
      amplifierDeleted,
      ...row
    }) => {
      let trackingUrl: string | null = null;
      let linkIssue: string | null = amplifierDeleted
        ? "This amplifier was deleted."
        : row.homeId && (homeDeleted || homeBrandId !== row.brandId)
          ? "This home is no longer available for this client."
          : null;
      const destination = row.homeId ? homeUrl : website;
      if (!linkIssue && !destination)
        linkIssue =
          "Add a booking website or choose a home with a listing URL.";
      if (!linkIssue && destination) {
        try {
          trackingUrl = influencerTrackingUrl(destination, row.id);
        } catch {
          linkIssue = "The booking destination is not a valid HTTP URL.";
        }
      }
      return { ...row, trackingUrl, linkIssue };
    },
  );
}

export async function saveInfluencerPartnership(
  input: z.input<typeof partnershipSaveInput>,
  orgId: string,
) {
  const values = partnershipSaveInput.parse(input);
  const id = await withTransaction(async (tx) => {
    const [existing] = values.id
      ? await tx
          .select()
          .from(partnerships)
          .where(
            and(
              eq(partnerships.id, values.id),
              eq(partnerships.organizationId, orgId),
              isNull(partnerships.deletedAt),
            ),
          )
          .for("update")
      : [];
    if (values.id && !existing) throw new ORPCError("NOT_FOUND");
    const merged = { ...existing, ...values };
    if (!merged.amplifierId || !merged.brandId)
      throw new ORPCError("BAD_REQUEST", {
        message: "Choose an amplifier and a client.",
      });
    if (
      existing &&
      values.brandId &&
      values.brandId !== existing.brandId &&
      existing.homeId &&
      values.homeId === undefined
    )
      throw new ORPCError("BAD_REQUEST", {
        message: "Choose or clear the home when changing clients.",
      });
    if (
      Boolean(merged.checkIn) !== Boolean(merged.checkOut) ||
      (merged.checkIn && merged.checkOut && merged.checkOut <= merged.checkIn)
    )
      throw new ORPCError("BAD_REQUEST", {
        message: "Provide both stay dates, with check-out after check-in.",
      });
    const [amplifier] = await tx
      .select({ id: amplifierTable.id })
      .from(amplifierTable)
      .where(
        and(
          eq(amplifierTable.id, merged.amplifierId),
          eq(amplifierTable.organizationId, orgId),
          isNull(amplifierTable.deletedAt),
        ),
      )
      .for("share");
    const [brand] = await tx
      .select({ id: brandTable.id })
      .from(brandTable)
      .where(
        and(
          eq(brandTable.id, merged.brandId),
          eq(brandTable.organizationId, orgId),
          eq(brandTable.relationship, "client"),
          isNull(brandTable.deletedAt),
        ),
      )
      .for("share");
    if (!amplifier || !brand)
      throw new ORPCError("BAD_REQUEST", {
        message: "Choose an active amplifier and client in this workspace.",
      });
    if (merged.homeId) {
      const [home] = await tx
        .select({ id: homeTable.id })
        .from(homeTable)
        .where(
          and(
            eq(homeTable.id, merged.homeId),
            eq(homeTable.brandId, brand.id),
            isNull(homeTable.deletedAt),
          ),
        )
        .for("share");
      if (!home)
        throw new ORPCError("BAD_REQUEST", {
          message: "Choose a home belonging to this client.",
        });
    }
    const { id: _id, ...patch } = values;
    const [saved] = existing
      ? await tx
          .update(partnerships)
          .set({ ...patch, updatedAt: new Date() })
          .where(eq(partnerships.id, existing.id))
          .returning({ id: partnerships.id })
      : await tx
          .insert(partnerships)
          .values({
            ...patch,
            organizationId: orgId,
            amplifierId: amplifier.id,
            brandId: brand.id,
          })
          .returning({ id: partnerships.id });
    if (!saved) throw new Error("Partnership was not saved.");
    return saved.id;
  });
  const [saved] = await listInfluencerPartnerships({}, orgId, id);
  if (!saved) throw new ORPCError("NOT_FOUND");
  return saved;
}

export async function deleteInfluencerPartnership(id: string, orgId: string) {
  const [removed] = await db
    .update(partnerships)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(partnerships.id, id),
        eq(partnerships.organizationId, orgId),
        isNull(partnerships.deletedAt),
      ),
    )
    .returning({ id: partnerships.id });
  if (!removed) throw new ORPCError("NOT_FOUND");
  return removed;
}
