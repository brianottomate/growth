import "server-only";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { brandTable } from "@/server/db/schema";
import { brandMarketsSchema } from "@/lib/markets";
import { steerSchema } from "@/lib/generation-steer";
import {
  setBrandMarkets,
  suggestBrandMarkets,
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
export const suggestBrandMarketsAction = growthAction({
  description:
    "Propose a regrouping of a brand's destinations from its imported home towns, listing evidence and current destinations, guided by steer. Read-only: returns the proposal with matching destination IDs preserved; show it against brandRead.get and save with brandWrite.setMarkets once the operator agrees. The WanderOS import creates the first set; a brand without imported homes has nothing to propose.",
  inputSchema: z.object({ brandId: z.string().min(1), steer: steerSchema }),
  outputSchema: z.object({ markets: brandMarketsSchema.shape.markets }),
  execute: async (input, ctx) => {
    await ownedBrand(input.brandId, ctx.orgId);
    return suggestBrandMarkets(input);
  },
});
export const setBrandMarketsAction = growthAction({
  description:
    "Save precise edits to a brand's destinations. Read brandRead.get first, preserve IDs and entries not being changed, and pass the complete destination list. Use brandRead.suggestMarkets with steer for a proposed regrouping.",
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
