import "server-only";

import { z } from "zod";

import {
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
  listProducts,
  listStorefronts,
  markStorefrontStale,
  markStorefrontStaleSchema,
  updateProduct,
  updateProductSchema,
  updateStorefront,
  updateStorefrontSchema,
  type ProductStorefrontActor,
} from "@/server/services/product-storefront.service";

import { growthTool } from "./types";

const actorFrom = (ctx: { orgId: string; userId: string }) =>
  ({
    orgId: ctx.orgId,
    userId: ctx.userId,
    kind: "agent",
  }) satisfies ProductStorefrontActor;

export const listProductAtlasProducts = growthTool({
  description:
    "List products in the organization with their brand, manager, lifecycle, atlas counts, and storefront summaries.",
  inputSchema: z.object({}),
  execute: async (_input, ctx) => {
    const products = await listProducts(actorFrom(ctx));
    return {
      products: products.map((product) => ({
        id: product.id,
        name: product.name,
        slug: product.slug,
        lifecycleStatus: product.lifecycleStatus,
        brand: product.brand,
        manager: product.manager,
        atlasCounts: {
          jobs: product.atlas.jobs.length,
          journeys: product.atlas.journeys.length,
          stories: product.atlas.stories.length,
          views: product.atlas.views.length,
          observations: product.atlas.observations.length,
        },
        storefronts: product.storefronts.map((storefront) => ({
          id: storefront.id,
          surface: storefront.surface,
          listingStatus: storefront.listingStatus,
          freshnessStatus: storefront.freshnessStatus,
          staleNote: storefront.staleNote,
          confirmedAt: storefront.confirmedAt,
        })),
      })),
    };
  },
});

export const readProductAtlas = growthTool({
  description:
    "Read one complete Product Atlas document, including jobs, journeys, stories, views, connections, implementation references, observations, and its storefronts.",
  inputSchema: z.object({ productId: z.string() }),
  execute: (input, ctx) => getProduct(actorFrom(ctx), input.productId),
});

export const listProductStorefronts = growthTool({
  description:
    "List storefront records and their product, surface, manager, listing state, freshness, stale note, and confirmation time.",
  inputSchema: z.object({}),
  execute: (_input, ctx) => listStorefronts(actorFrom(ctx)),
});

export const readProductStorefront = growthTool({
  description:
    "Read one complete storefront record, including target copy, Media Library references, external links, freshness state, and changelog.",
  inputSchema: z.object({ storefrontId: z.string() }),
  execute: (input, ctx) => getStorefront(actorFrom(ctx), input.storefrontId),
});

export const createProductAtlasProduct = growthTool({
  description:
    "Create a product owned by an existing brand, optionally with its complete typed Product Atlas graph.",
  inputSchema: createProductSchema,
  execute: (input, ctx) => createProduct(actorFrom(ctx), input),
});

export const updateProductAtlas = growthTool({
  description:
    "Update product identity, manager, lifecycle, or the complete atlas document. Pass the previously read updatedAt to prevent overwrites.",
  inputSchema: updateProductSchema,
  execute: (input, ctx) => updateProduct(actorFrom(ctx), input),
});

export const createProductStorefront = growthTool({
  description:
    "Create one storefront surface for a product. Asset ids must be ready Media Library items owned by the product brand.",
  inputSchema: createStorefrontSchema,
  execute: (input, ctx) => createStorefront(actorFrom(ctx), input),
});

export const updateProductStorefront = growthTool({
  description:
    "Update storefront copy, assets, links, or listing state. This always marks the storefront stale and requires a note explaining the external update needed.",
  inputSchema: updateStorefrontSchema,
  execute: (input, ctx) => updateStorefront(actorFrom(ctx), input),
});

export const markProductStorefrontStale = growthTool({
  description:
    "Mark a storefront stale without changing its target content. The note must state what changed or needs updating.",
  inputSchema: markStorefrontStaleSchema,
  execute: (input, ctx) => markStorefrontStale(actorFrom(ctx), input),
});

export const confirmProductStorefrontCurrent = growthTool({
  description:
    "Confirm that the external storefront now matches Growth's target content. This stamps the actor and time and clears the active stale note.",
  inputSchema: confirmStorefrontSchema,
  execute: (input, ctx) => confirmStorefrontUpToDate(actorFrom(ctx), input),
});

export const assignProductStorefrontManager = growthTool({
  description:
    "Assign or clear the organization member responsible for one storefront. Assignment routes responsibility and does not change permissions.",
  inputSchema: assignStorefrontManagerSchema,
  execute: (input, ctx) => assignStorefrontManager(actorFrom(ctx), input),
});

export const copySiblingStorefrontContent = growthTool({
  description:
    "Copy target content between sibling surfaces for the same product, such as ChatGPT and Claude. The target is marked stale.",
  inputSchema: copyStorefrontContentSchema,
  execute: (input, ctx) => copyStorefrontContent(actorFrom(ctx), input),
});
