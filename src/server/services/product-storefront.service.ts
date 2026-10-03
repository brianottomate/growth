import "server-only";

import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  resolveWorkspaceOrganizationId,
  WorkspaceAccessError,
} from "@/server/workspace-actor";

import {
  atlasWebPageIds,
  emptyProductAtlas,
  emptyStorefrontContent,
  productAtlasSchema,
  productLifecycleStatuses,
  storefrontChangeSchema,
  storefrontContentSchema,
  storefrontFreshnessStatuses,
  storefrontListingStatuses,
  storefrontMediaAssetIds,
  storefrontSurfaceIds,
  storefrontSurfaceRegistry,
  type ProductAtlas,
  type StorefrontChange,
  type StorefrontContent,
} from "@/lib/product-atlas";
import { db } from "@/server/db";
import {
  brandTable,
  mediaAssetTable,
  memberTable,
  productTable,
  storefrontTable,
  userTable,
  webPageTable,
} from "@/server/db/schema";

export type ProductStorefrontActor = {
  orgId: string;
  userId: string | null;
  kind: "human" | "agent" | "seed";
};

export class ProductStorefrontError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "FORBIDDEN" | "BAD_REQUEST",
    message: string,
  ) {
    super(message);
  }
}

const nullableUrl = z.string().trim().url().nullable();

export const createProductSchema = z.object({
  brandId: z.string().min(1),
  name: z.string().trim().min(1).max(160),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().max(2_000).nullable().default(null),
  lifecycleStatus: z.enum(productLifecycleStatuses).default("active"),
  managerUserId: z.string().nullable().default(null),
  atlas: productAtlasSchema.default(emptyProductAtlas),
});

export const updateProductSchema = z.object({
  productId: z.string().min(1),
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(2_000).nullable().optional(),
  lifecycleStatus: z.enum(productLifecycleStatuses).optional(),
  managerUserId: z.string().nullable().optional(),
  atlas: productAtlasSchema.optional(),
});

export const createStorefrontSchema = z.object({
  productId: z.string().min(1),
  surface: z.enum(storefrontSurfaceIds),
  managerUserId: z.string().nullable().default(null),
  externalListingId: z.string().trim().max(500).nullable().default(null),
  publicUrl: nullableUrl.default(null),
  managementUrl: nullableUrl.default(null),
  localizedContentUrl: nullableUrl.default(null),
  listingStatus: z.enum(storefrontListingStatuses).default("unknown"),
  content: storefrontContentSchema.default(emptyStorefrontContent),
});

export const updateStorefrontSchema = z.object({
  storefrontId: z.string().min(1),
  staleNote: z.string().trim().min(1).max(2_000),
  externalListingId: z.string().trim().max(500).nullable().optional(),
  publicUrl: nullableUrl.optional(),
  managementUrl: nullableUrl.optional(),
  localizedContentUrl: nullableUrl.optional(),
  listingStatus: z.enum(storefrontListingStatuses).optional(),
  content: storefrontContentSchema.optional(),
});

export const markStorefrontStaleSchema = z.object({
  storefrontId: z.string().min(1),
  note: z.string().trim().min(1).max(2_000),
});

export const confirmStorefrontSchema = z.object({
  storefrontId: z.string().min(1),
  note: z.string().trim().max(2_000).optional(),
});

export const assignStorefrontManagerSchema = z.object({
  storefrontId: z.string().min(1),
  managerUserId: z.string().nullable(),
});

export const copyStorefrontContentSchema = z.object({
  sourceStorefrontId: z.string().min(1),
  targetStorefrontId: z.string().min(1),
  staleNote: z.string().trim().min(1).max(2_000),
});

export async function resolveProductOrganizationId(input: {
  userId: string;
  preferredOrganizationId?: string | null;
}) {
  try {
    return await resolveWorkspaceOrganizationId(input);
  } catch (error) {
    if (error instanceof WorkspaceAccessError)
      throw new ProductStorefrontError("FORBIDDEN", error.message);
    throw error;
  }
}

async function assertMembership(actor: ProductStorefrontActor) {
  if (actor.kind === "seed" && actor.userId === null) return;
  if (!actor.userId) {
    throw new ProductStorefrontError(
      "FORBIDDEN",
      "A user identity is required",
    );
  }
  const membership = await db.query.memberTable.findFirst({
    where: and(
      eq(memberTable.organizationId, actor.orgId),
      eq(memberTable.userId, actor.userId),
    ),
    columns: { id: true },
  });
  if (!membership) {
    throw new ProductStorefrontError(
      "FORBIDDEN",
      "No access to this organization",
    );
  }
}

async function assertManager(
  actor: ProductStorefrontActor,
  userId: string | null,
) {
  if (!userId) return;
  const membership = await db.query.memberTable.findFirst({
    where: and(
      eq(memberTable.organizationId, actor.orgId),
      eq(memberTable.userId, userId),
    ),
    columns: { id: true },
  });
  if (!membership) {
    throw new ProductStorefrontError(
      "BAD_REQUEST",
      "The assigned manager must belong to this organization",
    );
  }
}

async function actorSnapshot(actor: ProductStorefrontActor) {
  if (!actor.userId) return { id: null, name: null };
  const user = await db.query.userTable.findFirst({
    where: eq(userTable.id, actor.userId),
    columns: { id: true, name: true, email: true },
  });
  return {
    id: actor.userId,
    name: user?.name ?? user?.email ?? null,
  };
}

function change(
  actor: ProductStorefrontActor,
  snapshot: { id: string | null; name: string | null },
  input: Omit<StorefrontChange, "at" | "actorId" | "actorName" | "actorKind">,
) {
  return storefrontChangeSchema.parse({
    at: new Date().toISOString(),
    actorId: snapshot.id,
    actorName: snapshot.name,
    actorKind: actor.kind,
    ...input,
  });
}

async function getProductForActor(
  actor: ProductStorefrontActor,
  productId: string,
) {
  await assertMembership(actor);
  const product = await db.query.productTable.findFirst({
    where: and(
      eq(productTable.id, productId),
      eq(productTable.organizationId, actor.orgId),
      isNull(productTable.deletedAt),
    ),
    with: {
      brand: true,
      manager: true,
      storefronts: { where: isNull(storefrontTable.deletedAt) },
    },
  });
  if (!product) {
    throw new ProductStorefrontError("NOT_FOUND", "Product not found");
  }
  return product;
}

async function getStorefrontForActor(
  actor: ProductStorefrontActor,
  storefrontId: string,
) {
  await assertMembership(actor);
  const storefront = await db.query.storefrontTable.findFirst({
    where: and(
      eq(storefrontTable.id, storefrontId),
      isNull(storefrontTable.deletedAt),
    ),
    with: {
      product: { with: { brand: true } },
      manager: true,
      staleMarker: true,
      confirmer: true,
    },
  });
  if (storefront?.product.organizationId !== actor.orgId) {
    throw new ProductStorefrontError("NOT_FOUND", "Storefront not found");
  }
  return storefront;
}

async function validateAtlasBrandReferences(
  brandId: string,
  atlas: ProductAtlas,
) {
  const ids = [...new Set(atlasWebPageIds(atlas))];
  if (ids.length === 0) return;
  const pages = await db.query.webPageTable.findMany({
    where: and(
      inArray(webPageTable.id, ids),
      eq(webPageTable.brandId, brandId),
      isNull(webPageTable.deletedAt),
    ),
    columns: { id: true },
  });
  if (pages.length !== ids.length) {
    throw new ProductStorefrontError(
      "BAD_REQUEST",
      "Every referenced Website page must be active and belong to the product brand",
    );
  }
}

async function validateStorefrontMedia(
  brandId: string,
  content: StorefrontContent,
) {
  const ids = [...new Set(storefrontMediaAssetIds(content))];
  if (ids.length === 0) return;
  const assets = await db.query.mediaAssetTable.findMany({
    where: and(
      inArray(mediaAssetTable.id, ids),
      eq(mediaAssetTable.brandId, brandId),
      eq(mediaAssetTable.status, "ready"),
      eq(mediaAssetTable.reviewStatus, "approved"),
      isNull(mediaAssetTable.deletedAt),
    ),
    columns: { id: true, kind: true },
  });
  if (assets.length !== ids.length) {
    throw new ProductStorefrontError(
      "BAD_REQUEST",
      "Every referenced asset must be ready and belong to the product brand",
    );
  }
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const imageIds = [
    content.iconMediaAssetId,
    ...content.screenshots.map((item) => item.mediaAssetId),
    ...content.promotionalAssets.map((item) => item.mediaAssetId),
  ].filter((id): id is string => Boolean(id));
  for (const imageId of imageIds) {
    if (byId.get(imageId)?.kind !== "image") {
      throw new ProductStorefrontError(
        "BAD_REQUEST",
        `Storefront image ${imageId} must reference an image asset`,
      );
    }
  }
  for (const video of content.videos) {
    if (byId.get(video.mediaAssetId)?.kind !== "video") {
      throw new ProductStorefrontError(
        "BAD_REQUEST",
        `Video ${video.mediaAssetId} must reference a video asset`,
      );
    }
  }
}

export async function listProducts(actor: ProductStorefrontActor) {
  await assertMembership(actor);
  return db.query.productTable.findMany({
    where: and(
      eq(productTable.organizationId, actor.orgId),
      isNull(productTable.deletedAt),
    ),
    with: {
      brand: { columns: { id: true, name: true, logo: true } },
      manager: { columns: { id: true, name: true, email: true, image: true } },
      storefronts: {
        where: isNull(storefrontTable.deletedAt),
        orderBy: [asc(storefrontTable.surface)],
      },
    },
    orderBy: [asc(productTable.name)],
  });
}

export async function getProduct(
  actor: ProductStorefrontActor,
  productId: string,
) {
  return getProductForActor(actor, productId);
}

export async function listStorefronts(actor: ProductStorefrontActor) {
  await assertMembership(actor);
  return db.query.storefrontTable.findMany({
    where: and(
      isNull(storefrontTable.deletedAt),
      inArray(
        storefrontTable.productId,
        db
          .select({ id: productTable.id })
          .from(productTable)
          .where(
            and(
              eq(productTable.organizationId, actor.orgId),
              isNull(productTable.deletedAt),
            ),
          ),
      ),
    ),
    with: {
      product: { with: { brand: true } },
      manager: { columns: { id: true, name: true, email: true, image: true } },
      staleMarker: { columns: { id: true, name: true, email: true } },
      confirmer: { columns: { id: true, name: true, email: true } },
    },
    orderBy: [
      desc(storefrontTable.staleMarkedAt),
      asc(storefrontTable.surface),
    ],
  });
}

export async function getStorefront(
  actor: ProductStorefrontActor,
  storefrontId: string,
) {
  return getStorefrontForActor(actor, storefrontId);
}

export async function listProductEditors(actor: ProductStorefrontActor) {
  await assertMembership(actor);
  const memberships = await db.query.memberTable.findMany({
    where: eq(memberTable.organizationId, actor.orgId),
    with: {
      user: { columns: { id: true, name: true, email: true, image: true } },
    },
  });
  return memberships.map((membership) => membership.user);
}

export async function listProductBrandAssets(
  actor: ProductStorefrontActor,
  brandId: string,
) {
  await assertMembership(actor);
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, brandId),
      eq(brandTable.organizationId, actor.orgId),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true },
  });
  if (!brand) throw new ProductStorefrontError("NOT_FOUND", "Brand not found");
  return db.query.mediaAssetTable.findMany({
    where: and(
      eq(mediaAssetTable.brandId, brandId),
      eq(mediaAssetTable.status, "ready"),
      eq(mediaAssetTable.reviewStatus, "approved"),
      isNull(mediaAssetTable.deletedAt),
      inArray(mediaAssetTable.kind, ["image", "gif", "video"]),
    ),
    columns: {
      id: true,
      title: true,
      alt: true,
      kind: true,
      url: true,
      thumbnailUrl: true,
      width: true,
      height: true,
    },
    orderBy: [desc(mediaAssetTable.createdAt)],
  });
}

export async function createProduct(
  actor: ProductStorefrontActor,
  rawInput: z.input<typeof createProductSchema>,
) {
  const input = createProductSchema.parse(rawInput);
  await assertMembership(actor);
  await assertManager(actor, input.managerUserId);
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, input.brandId),
      eq(brandTable.organizationId, actor.orgId),
      isNull(brandTable.deletedAt),
    ),
  });
  if (!brand) {
    throw new ProductStorefrontError(
      "BAD_REQUEST",
      "Product brand must belong to this organization",
    );
  }
  await validateAtlasBrandReferences(input.brandId, input.atlas);
  const [created] = await db
    .insert(productTable)
    .values({ ...input, organizationId: actor.orgId })
    .returning();
  return created!;
}

export async function updateProduct(
  actor: ProductStorefrontActor,
  rawInput: z.input<typeof updateProductSchema>,
) {
  const input = updateProductSchema.parse(rawInput);
  const product = await getProductForActor(actor, input.productId);
  if (input.managerUserId !== undefined) {
    await assertManager(actor, input.managerUserId);
  }
  if (input.atlas) {
    await validateAtlasBrandReferences(product.brandId, input.atlas);
  }
  const [updated] = await db
    .update(productTable)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && {
        description: input.description,
      }),
      ...(input.lifecycleStatus !== undefined && {
        lifecycleStatus: input.lifecycleStatus,
      }),
      ...(input.managerUserId !== undefined && {
        managerUserId: input.managerUserId,
      }),
      ...(input.atlas !== undefined && { atlas: input.atlas }),
      updatedAt: new Date(),
    })
    .where(eq(productTable.id, product.id))
    .returning();
  if (!updated)
    throw new ProductStorefrontError("NOT_FOUND", "Product not found");
  return updated;
}

export async function createStorefront(
  actor: ProductStorefrontActor,
  rawInput: z.input<typeof createStorefrontSchema>,
) {
  const input = createStorefrontSchema.parse(rawInput);
  const product = await getProductForActor(actor, input.productId);
  await assertManager(actor, input.managerUserId);
  await validateStorefrontMedia(product.brandId, input.content);
  const snapshot = await actorSnapshot(actor);
  const createdChange = change(actor, snapshot, {
    action: "created",
    note: `Created ${storefrontSurfaceRegistry[input.surface].label}`,
    changedPaths: [],
  });
  const [created] = await db
    .insert(storefrontTable)
    .values({
      ...input,
      changelog: [createdChange],
    })
    .returning();
  return created!;
}

export async function updateStorefront(
  actor: ProductStorefrontActor,
  rawInput: z.input<typeof updateStorefrontSchema>,
) {
  const input = updateStorefrontSchema.parse(rawInput);
  const storefront = await getStorefrontForActor(actor, input.storefrontId);
  if (input.content) {
    await validateStorefrontMedia(storefront.product.brandId, input.content);
  }
  const snapshot = await actorSnapshot(actor);
  const changedPaths = [
    input.content !== undefined ? "content" : null,
    input.externalListingId !== undefined ? "externalListingId" : null,
    input.publicUrl !== undefined ? "publicUrl" : null,
    input.managementUrl !== undefined ? "managementUrl" : null,
    input.localizedContentUrl !== undefined ? "localizedContentUrl" : null,
    input.listingStatus !== undefined ? "listingStatus" : null,
  ].filter((path): path is string => Boolean(path));
  if (changedPaths.length === 0) {
    throw new ProductStorefrontError("BAD_REQUEST", "No changes supplied");
  }
  const action = changedPaths.some((path) => path.endsWith("Url"))
    ? "links_updated"
    : "content_updated";
  const now = new Date();
  const nextChangelog = [
    ...storefront.changelog,
    change(actor, snapshot, {
      action,
      note: input.staleNote,
      changedPaths,
    }),
    change(actor, snapshot, {
      action: "marked_stale",
      note: input.staleNote,
      changedPaths,
    }),
  ];
  const [updated] = await db
    .update(storefrontTable)
    .set({
      ...(input.content !== undefined && { content: input.content }),
      ...(input.externalListingId !== undefined && {
        externalListingId: input.externalListingId,
      }),
      ...(input.publicUrl !== undefined && { publicUrl: input.publicUrl }),
      ...(input.managementUrl !== undefined && {
        managementUrl: input.managementUrl,
      }),
      ...(input.localizedContentUrl !== undefined && {
        localizedContentUrl: input.localizedContentUrl,
      }),
      ...(input.listingStatus !== undefined && {
        listingStatus: input.listingStatus,
      }),
      freshnessStatus: "stale",
      staleNote: input.staleNote,
      staleMarkedAt: now,
      staleMarkedBy: actor.userId,
      changelog: nextChangelog,
      updatedAt: now,
    })
    .where(eq(storefrontTable.id, storefront.id))
    .returning();
  if (!updated)
    throw new ProductStorefrontError("NOT_FOUND", "Storefront not found");
  return updated;
}

export async function markStorefrontStale(
  actor: ProductStorefrontActor,
  rawInput: z.input<typeof markStorefrontStaleSchema>,
) {
  const input = markStorefrontStaleSchema.parse(rawInput);
  const storefront = await getStorefrontForActor(actor, input.storefrontId);
  const snapshot = await actorSnapshot(actor);
  const now = new Date();
  const [updated] = await db
    .update(storefrontTable)
    .set({
      freshnessStatus: "stale",
      staleNote: input.note,
      staleMarkedAt: now,
      staleMarkedBy: actor.userId,
      changelog: [
        ...storefront.changelog,
        change(actor, snapshot, {
          action: "marked_stale",
          note: input.note,
          changedPaths: [],
        }),
      ],
      updatedAt: now,
    })
    .where(eq(storefrontTable.id, storefront.id))
    .returning();
  if (!updated)
    throw new ProductStorefrontError("NOT_FOUND", "Storefront not found");
  return updated;
}

export async function confirmStorefrontUpToDate(
  actor: ProductStorefrontActor,
  rawInput: z.input<typeof confirmStorefrontSchema>,
) {
  const input = confirmStorefrontSchema.parse(rawInput);
  const storefront = await getStorefrontForActor(actor, input.storefrontId);
  const snapshot = await actorSnapshot(actor);
  const now = new Date();
  const [updated] = await db
    .update(storefrontTable)
    .set({
      freshnessStatus: "up_to_date",
      staleNote: null,
      confirmedAt: now,
      confirmedBy: actor.userId,
      changelog: [
        ...storefront.changelog,
        change(actor, snapshot, {
          action: "confirmed_up_to_date",
          note: input.note,
          changedPaths: [],
        }),
      ],
      updatedAt: now,
    })
    .where(eq(storefrontTable.id, storefront.id))
    .returning();
  if (!updated)
    throw new ProductStorefrontError("NOT_FOUND", "Storefront not found");
  return updated;
}

export async function assignStorefrontManager(
  actor: ProductStorefrontActor,
  rawInput: z.input<typeof assignStorefrontManagerSchema>,
) {
  const input = assignStorefrontManagerSchema.parse(rawInput);
  const storefront = await getStorefrontForActor(actor, input.storefrontId);
  await assertManager(actor, input.managerUserId);
  const snapshot = await actorSnapshot(actor);
  const now = new Date();
  const [updated] = await db
    .update(storefrontTable)
    .set({
      managerUserId: input.managerUserId,
      changelog: [
        ...storefront.changelog,
        change(actor, snapshot, {
          action: "manager_changed",
          note: input.managerUserId
            ? `Assigned manager ${input.managerUserId}`
            : "Cleared manager",
          changedPaths: ["managerUserId"],
        }),
      ],
      updatedAt: now,
    })
    .where(eq(storefrontTable.id, storefront.id))
    .returning();
  if (!updated)
    throw new ProductStorefrontError("NOT_FOUND", "Storefront not found");
  return updated;
}

export async function copyStorefrontContent(
  actor: ProductStorefrontActor,
  rawInput: z.input<typeof copyStorefrontContentSchema>,
) {
  const input = copyStorefrontContentSchema.parse(rawInput);
  const source = await getStorefrontForActor(actor, input.sourceStorefrontId);
  const target = await getStorefrontForActor(actor, input.targetStorefrontId);
  if (source.productId !== target.productId) {
    throw new ProductStorefrontError(
      "BAD_REQUEST",
      "Content can only be copied between storefronts for the same product",
    );
  }
  const sourceFamily = storefrontSurfaceRegistry[source.surface].family;
  const targetFamily = storefrontSurfaceRegistry[target.surface].family;
  if (sourceFamily !== targetFamily) {
    throw new ProductStorefrontError(
      "BAD_REQUEST",
      "Content can only be copied between sibling storefront surfaces",
    );
  }
  await validateStorefrontMedia(target.product.brandId, source.content);
  const snapshot = await actorSnapshot(actor);
  const now = new Date();
  const [updated] = await db
    .update(storefrontTable)
    .set({
      content: source.content,
      freshnessStatus: "stale",
      staleNote: input.staleNote,
      staleMarkedAt: now,
      staleMarkedBy: actor.userId,
      changelog: [
        ...target.changelog,
        change(actor, snapshot, {
          action: "content_copied",
          note: input.staleNote,
          changedPaths: ["content"],
        }),
        change(actor, snapshot, {
          action: "marked_stale",
          note: input.staleNote,
          changedPaths: ["content"],
        }),
      ],
      updatedAt: now,
    })
    .where(eq(storefrontTable.id, target.id))
    .returning();
  if (!updated)
    throw new ProductStorefrontError("NOT_FOUND", "Storefront not found");
  return updated;
}

export const productStorefrontSchemas = {
  createProductSchema,
  updateProductSchema,
  createStorefrontSchema,
  updateStorefrontSchema,
  markStorefrontStaleSchema,
  confirmStorefrontSchema,
  assignStorefrontManagerSchema,
  copyStorefrontContentSchema,
  storefrontContentSchema,
  productAtlasSchema,
  storefrontFreshnessStatuses,
};
