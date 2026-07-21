import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  ProductStorefrontError,
  assignStorefrontManager,
  assignStorefrontManagerSchema,
  confirmStorefrontSchema,
  confirmStorefrontUpToDate,
  copyStorefrontContent,
  copyStorefrontContentSchema,
  createProduct,
  createProductSchema,
  createStorefront,
  createStorefrontSchema,
  getProduct,
  getStorefront,
  listProductBrandAssets,
  listProductEditors,
  listProducts,
  listStorefronts,
  markStorefrontStale,
  markStorefrontStaleSchema,
  resolveProductOrganizationId,
  updateProduct,
  updateProductSchema,
  updateStorefront,
  updateStorefrontSchema,
  type ProductStorefrontActor,
} from "@/server/services/product-storefront.service";

import { createTRPCRouter, protectedProcedure } from "../trpc";

function mapServiceError(error: unknown): never {
  if (error instanceof ProductStorefrontError) {
    throw new TRPCError({
      code: error.code,
      message: error.message,
      cause: error,
    });
  }
  throw error;
}

async function actorFor(ctx: {
  session: {
    user: { id: string };
    session: { activeOrganizationId?: string | null };
  };
}): Promise<ProductStorefrontActor> {
  const orgId = await resolveProductOrganizationId({
    userId: ctx.session.user.id,
    preferredOrganizationId: ctx.session.session.activeOrganizationId,
  });
  return { orgId, userId: ctx.session.user.id, kind: "human" };
}

const run = async <T>(
  ctx: Parameters<typeof actorFor>[0],
  operation: (actor: ProductStorefrontActor) => Promise<T>,
) => {
  try {
    return await operation(await actorFor(ctx));
  } catch (error) {
    mapServiceError(error);
  }
};

export const productStorefrontRouter = createTRPCRouter({
  listProducts: protectedProcedure.query(({ ctx }) =>
    run(ctx, (actor) => listProducts(actor)),
  ),
  getProduct: protectedProcedure
    .input(z.object({ productId: z.string() }))
    .query(({ ctx, input }) =>
      run(ctx, (actor) => getProduct(actor, input.productId)),
    ),
  listStorefronts: protectedProcedure.query(({ ctx }) =>
    run(ctx, (actor) => listStorefronts(actor)),
  ),
  getStorefront: protectedProcedure
    .input(z.object({ storefrontId: z.string() }))
    .query(({ ctx, input }) =>
      run(ctx, (actor) => getStorefront(actor, input.storefrontId)),
    ),
  listEditors: protectedProcedure.query(({ ctx }) =>
    run(ctx, (actor) => listProductEditors(actor)),
  ),
  listBrandAssets: protectedProcedure
    .input(z.object({ brandId: z.string() }))
    .query(({ ctx, input }) =>
      run(ctx, (actor) => listProductBrandAssets(actor, input.brandId)),
    ),
  createProduct: protectedProcedure
    .input(createProductSchema)
    .mutation(({ ctx, input }) =>
      run(ctx, (actor) => createProduct(actor, input)),
    ),
  updateProduct: protectedProcedure
    .input(updateProductSchema)
    .mutation(({ ctx, input }) =>
      run(ctx, (actor) => updateProduct(actor, input)),
    ),
  createStorefront: protectedProcedure
    .input(createStorefrontSchema)
    .mutation(({ ctx, input }) =>
      run(ctx, (actor) => createStorefront(actor, input)),
    ),
  updateStorefront: protectedProcedure
    .input(updateStorefrontSchema)
    .mutation(({ ctx, input }) =>
      run(ctx, (actor) => updateStorefront(actor, input)),
    ),
  markStale: protectedProcedure
    .input(markStorefrontStaleSchema)
    .mutation(({ ctx, input }) =>
      run(ctx, (actor) => markStorefrontStale(actor, input)),
    ),
  confirmUpToDate: protectedProcedure
    .input(confirmStorefrontSchema)
    .mutation(({ ctx, input }) =>
      run(ctx, (actor) => confirmStorefrontUpToDate(actor, input)),
    ),
  assignManager: protectedProcedure
    .input(assignStorefrontManagerSchema)
    .mutation(({ ctx, input }) =>
      run(ctx, (actor) => assignStorefrontManager(actor, input)),
    ),
  copySiblingContent: protectedProcedure
    .input(copyStorefrontContentSchema)
    .mutation(({ ctx, input }) =>
      run(ctx, (actor) => copyStorefrontContent(actor, input)),
    ),
});
