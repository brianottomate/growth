import "server-only";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { brandTable } from "@/server/db/schema";
import { creativeDirectionSchema } from "@/lib/brand-direction";
import { brandMarketsSchema } from "@/lib/markets";
import { steerSchema } from "@/lib/generation-steer";
import {
  draftBrandMarkets,
  setBrandMarkets,
} from "@/server/services/brand-markets.service";
import { growthAction } from "./types";

async function ownedBrand(brandId: string, orgId: string) {
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, brandId),
      eq(brandTable.organizationId, orgId),
      isNull(brandTable.deletedAt),
    ),
    columns: {
      id: true,
      name: true,
      story: true,
      creativeDirection: true,
      markets: true,
    },
  });
  if (!brand) throw new Error("That brand is not in your workspace.");
  return brand;
}
export const readBrandContext = growthAction({
  description:
    "Read a brand's current story, creative direction and destinations before shaping them. Personas are read with personaRead.list; home inventory with performanceRead. Preserve accepted choices when passing steer to a generation action.",
  inputSchema: z.object({ brandId: z.string().min(1) }),
  outputSchema: z.object({
    id: z.string(),
    name: z.string(),
    story: z.string().nullable(),
    creativeDirection: creativeDirectionSchema.nullable(),
    markets: brandMarketsSchema.nullable(),
  }),
  execute: (input, ctx) => ownedBrand(input.brandId, ctx.orgId),
});
export const draftBrandMarketsAction = growthAction({
  description:
    "Regenerate and save a brand's destinations from imported home towns, listing evidence and current destinations. Pass steer with the operator's requested changes. Preserves matching destination IDs and rejects overlapping towns. Does not change campaign targeting.",
  inputSchema: z.object({ brandId: z.string().min(1), steer: steerSchema }),
  outputSchema: z.object({ markets: brandMarketsSchema }),
  execute: async (input, ctx) => {
    await ownedBrand(input.brandId, ctx.orgId);
    return draftBrandMarkets(input);
  },
});
export const setBrandMarketsAction = growthAction({
  description:
    "Save precise edits to a brand's destinations. Read brandRead.context first, preserve IDs and entries not being changed, and pass the complete destination list. Use draftMarkets with steer for a generated revision.",
  inputSchema: z.object({
    brandId: z.string().min(1),
    markets: brandMarketsSchema.shape.markets,
  }),
  outputSchema: z.object({ markets: brandMarketsSchema }),
  execute: async (input, ctx) => {
    await ownedBrand(input.brandId, ctx.orgId);
    return setBrandMarkets({ ...input, userId: ctx.userId });
  },
});
