import { ORPCError } from "@orpc/server";
import { z } from "zod";

import {
  ProductStorefrontError,
  listProductBrandAssets,
  listProductEditors,
  type ProductStorefrontActor,
} from "@/server/services/product-storefront.service";
import { listStorefrontReferenceBrands } from "@/server/services/storefront-reference.service";

import { workspaceProcedure, actionProcedure } from "@/server/api/orpc";
import {
  readProductAtlas,
  readProductStorefront,
  listProductStorefronts,
  listProductStorefrontReferences,
  createProductAtlasProduct,
  updateProductAtlas,
  createProductStorefront,
  updateProductStorefront,
  markProductStorefrontStale,
  confirmProductStorefrontCurrent,
  assignProductStorefrontManager,
  copySiblingStorefrontContent,
  captureProductStorefrontReference,
  removeProductStorefrontReference,
} from "@/server/ai/capabilities/product-storefront";

function mapServiceError(error: unknown): never {
  if (error instanceof ProductStorefrontError) {
    throw new ORPCError(error.code, { message: error.message, cause: error });
  }
  throw error;
}

function actorFor(ctx: {
  workspace: { orgId: string; userId: string };
}): ProductStorefrontActor {
  return { ...ctx.workspace, kind: "human" };
}

const run = async <T>(
  ctx: Parameters<typeof actorFor>[0],
  operation: (actor: ProductStorefrontActor) => Promise<T>,
) => {
  try {
    return await operation(actorFor(ctx));
  } catch (error) {
    mapServiceError(error);
  }
};

export const productStorefrontRouter = {
  getProduct: actionProcedure(readProductAtlas),
  listStorefronts: actionProcedure(listProductStorefronts),
  getStorefront: actionProcedure(readProductStorefront),
  listEditors: workspaceProcedure.handler(({ context: ctx }) =>
    run(ctx, (actor) => listProductEditors(actor)),
  ),
  listBrandAssets: workspaceProcedure
    .input(z.object({ brandId: z.string() }))
    .handler(({ context: ctx, input }) =>
      run(ctx, (actor) => listProductBrandAssets(actor, input.brandId)),
    ),
  listReferenceBrands: workspaceProcedure
    .input(z.object({ storefrontId: z.string().min(1) }))
    .handler(({ context: ctx, input }) =>
      run(ctx, (actor) =>
        listStorefrontReferenceBrands(actor, input.storefrontId),
      ),
    ),
  listReferences: actionProcedure(listProductStorefrontReferences),
  createProduct: actionProcedure(createProductAtlasProduct),
  updateProduct: actionProcedure(updateProductAtlas),
  createStorefront: actionProcedure(createProductStorefront),
  updateStorefront: actionProcedure(updateProductStorefront),
  markStale: actionProcedure(markProductStorefrontStale),
  confirmUpToDate: actionProcedure(confirmProductStorefrontCurrent),
  assignManager: actionProcedure(assignProductStorefrontManager),
  copySiblingContent: actionProcedure(copySiblingStorefrontContent),
  captureReference: actionProcedure(captureProductStorefrontReference),
  removeReference: actionProcedure(removeProductStorefrontReference),
};
