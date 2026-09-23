import { and, eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { actionProcedure, protectedProcedure } from "@/server/api/orpc";
import { syncOwnedBrandContent } from "@/server/ai/capabilities/operations";
import { brandTable, memberTable } from "@/server/db/schema";
import { type db } from "@/server/db";
import { createId } from "@/server/db/utils";
import {
  connectBrandToZernioProfile,
  getZernioBrandCatalog,
} from "@/server/services/zernio-brand.service";

async function assertOwnedBrandAccess(
  ctx: {
    db: typeof db;
    session: { user: { id: string } };
  },
  brandId: string,
) {
  const brand = await ctx.db.query.brandTable.findFirst({
    where: eq(brandTable.id, brandId),
  });
  if (!brand) throw new ORPCError("NOT_FOUND", { message: "Brand not found" });
  if (!brand.organizationId) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Tracked brands do not receive Zernio workspace profiles",
    });
  }
  const membership = await ctx.db.query.memberTable.findFirst({
    where: and(
      eq(memberTable.userId, ctx.session.user.id),
      eq(memberTable.organizationId, brand.organizationId),
    ),
  });
  if (!membership) {
    throw new ORPCError("FORBIDDEN", { message: "No access to this brand" });
  }
  return brand;
}

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "brand"
  );
}

export const zernioRouter = {
  catalog: protectedProcedure.handler(() => getZernioBrandCatalog()),

  /** Explicit owned-brand history fetch. No cron or automatic refresh. */
  syncHistory: actionProcedure(syncOwnedBrandContent),

  connectProfile: protectedProcedure
    .input(z.object({ brandId: z.string(), profileId: z.string().min(1) }))
    .handler(async ({ context: ctx, input }) => {
      await assertOwnedBrandAccess(ctx, input.brandId);
      try {
        return await connectBrandToZernioProfile(
          input.brandId,
          input.profileId,
        );
      } catch (error) {
        throw new ORPCError(
          error instanceof Error && error.message.includes("already assigned")
            ? "CONFLICT"
            : "BAD_REQUEST",
          {
            message:
              error instanceof Error
                ? error.message
                : "Could not connect Zernio",
          },
        );
      }
    }),

  importProfiles: protectedProcedure
    .input(
      z.object({
        profiles: z
          .array(
            z.object({
              profileId: z.string().min(1),
              brandType: z.enum(["company", "personal"]),
            }),
          )
          .min(1)
          .max(50),
      }),
    )
    .handler(async ({ context: ctx, input }) => {
      const membership = await ctx.db.query.memberTable.findFirst({
        where: eq(memberTable.userId, ctx.session.user.id),
      });
      if (!membership) {
        throw new ORPCError("FORBIDDEN", {
          message: "You must belong to an organization to import brands",
        });
      }

      const catalog = await getZernioBrandCatalog();
      if (!catalog.configured) {
        throw new ORPCError("PRECONDITION_FAILED", {
          message: "Zernio is not configured",
        });
      }

      const imported: Array<{
        brandId: string;
        brandName: string;
        profileId: string;
        accounts: number;
      }> = [];
      const skipped: Array<{ profileId: string; reason: string }> = [];

      for (const requested of input.profiles) {
        const profile = catalog.profiles.find(
          (candidate) => candidate.id === requested.profileId,
        );
        if (!profile) {
          skipped.push({
            profileId: requested.profileId,
            reason: "Profile not found",
          });
          continue;
        }
        if (profile.assignedBrand) {
          skipped.push({
            profileId: profile.id,
            reason: `Already imported as ${profile.assignedBrand.name}`,
          });
          continue;
        }

        let slug = slugify(profile.name);
        const slugTaken = await ctx.db.query.brandTable.findFirst({
          where: and(
            eq(brandTable.organizationId, membership.organizationId),
            eq(brandTable.slug, slug),
          ),
          columns: { id: true },
        });
        if (slugTaken) slug = `${slug}-${profile.id.slice(-4).toLowerCase()}`;

        const [brand] = await ctx.db
          .insert(brandTable)
          .values({
            id: createId("brand"),
            organizationId: membership.organizationId,
            ownerId: ctx.session.user.id,
            name: profile.name,
            slug,
            type: requested.brandType,
          })
          .returning();
        if (!brand) continue;

        try {
          const result = await connectBrandToZernioProfile(
            brand.id,
            profile.id,
          );
          imported.push({
            brandId: brand.id,
            brandName: brand.name,
            profileId: profile.id,
            accounts: result.accounts,
          });
        } catch (error) {
          await ctx.db.delete(brandTable).where(eq(brandTable.id, brand.id));
          throw new ORPCError("BAD_REQUEST", {
            message:
              error instanceof Error
                ? error.message
                : "Could not import profile",
          });
        }
      }

      return { imported, skipped };
    }),
};
