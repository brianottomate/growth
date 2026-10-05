import "server-only";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  creativeDocumentSchema,
  type CreativeDocument,
} from "@/lib/creative-document";
import { db, withTransaction, type TransactionClient } from "@/server/db";
import {
  brandTable,
  contentPostTable,
  creativeRunTable,
  mediaAssetTable,
  platformDocumentTable,
  platformPostTable,
  productionPacketTable,
} from "@/server/db/schema";

type Identity = { organizationId: string; userId: string };
export async function getCreativeDocument(
  documentId: string,
  organizationId: string,
) {
  const row = await db.query.productionPacketTable.findFirst({
    where: and(
      eq(productionPacketTable.id, documentId),
      eq(productionPacketTable.organizationId, organizationId),
    ),
  });
  if (!row) throw new Error("Creative document not found in this workspace.");
  const document = creativeDocumentSchema.parse(row.document);
  if (document.type !== row.documentType)
    throw new Error("Creative document type mismatch.");
  return { ...row, document };
}
export async function lockDocument(
  tx: TransactionClient,
  id: string,
  organizationId: string,
) {
  const rows = await tx
    .select()
    .from(productionPacketTable)
    .where(
      and(
        eq(productionPacketTable.id, id),
        eq(productionPacketTable.organizationId, organizationId),
      ),
    )
    .for("update");
  const row = rows[0];
  if (!row) throw new Error("Creative document not found in this workspace.");
  await tx
    .update(creativeRunTable)
    .set({
      status: "error",
      error: "Production timed out. You can retry.",
      completedAt: new Date(),
    })
    .where(
      and(
        eq(creativeRunTable.packetId, id),
        inArray(creativeRunTable.status, ["queued", "processing"]),
        sql`${creativeRunTable.expiresAt} <= now()`,
      ),
    );
  return row;
}
export async function assertUnlocked(tx: TransactionClient, id: string) {
  const active = await tx.query.creativeRunTable.findFirst({
    where: and(
      eq(creativeRunTable.packetId, id),
      inArray(creativeRunTable.status, ["queued", "processing"]),
    ),
  });
  if (active)
    throw new Error(
      "This document is being produced. Wait for completion or cancel the run before editing.",
    );
}
async function validateAssets(document: CreativeDocument, brandId: string) {
  const ids = new Set(document.brief.assets.map((a) => a.assetId));
  if (document.type === "article" && document.content.heroAssetId)
    ids.add(document.content.heroAssetId);
  if (document.type === "image" || document.type === "video") {
    if (document.content.selectedAssetId)
      ids.add(document.content.selectedAssetId);
  }
  if (document.type === "video") {
    if (document.content.coverAssetId) ids.add(document.content.coverAssetId);
    document.content.scenes.forEach((s) =>
      s.sourceAssetIds.forEach((id) => ids.add(id)),
    );
  }
  if (!ids.size) return;
  const assets = await db
    .select({ id: mediaAssetTable.id, kind: mediaAssetTable.kind })
    .from(mediaAssetTable)
    .where(
      and(
        inArray(mediaAssetTable.id, [...ids]),
        eq(mediaAssetTable.brandId, brandId),
        eq(mediaAssetTable.status, "ready"),
        isNull(mediaAssetTable.deletedAt),
      ),
    );
  if (assets.length !== ids.size)
    throw new Error("References must be ready media belonging to this brand.");
  const imageId =
    document.type === "article"
      ? document.content.heroAssetId
      : document.type === "video"
        ? document.content.coverAssetId
        : undefined;
  if (imageId && assets.find((a) => a.id === imageId)?.kind !== "image")
    throw new Error("The hero or cover must be an image.");
  if (
    (document.type === "image" || document.type === "video") &&
    document.content.selectedAssetId &&
    assets.find((a) => a.id === document.content.selectedAssetId)?.kind !==
      document.type
  )
    throw new Error("Selected media must match the document type.");
}
export async function createCreativeDocument(
  input: Identity & {
    brandId: string;
    contentPostId?: string;
    title: string;
    document: CreativeDocument;
  },
) {
  const document = creativeDocumentSchema.parse(input.document);
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, input.brandId),
      eq(brandTable.organizationId, input.organizationId),
      isNull(brandTable.deletedAt),
    ),
  });
  if (!brand) throw new Error("Brand not found in this workspace.");
  if (input.contentPostId) {
    const post = await db.query.contentPostTable.findFirst({
      where: and(
        eq(contentPostTable.id, input.contentPostId),
        eq(contentPostTable.brandId, brand.id),
        isNull(contentPostTable.deletedAt),
      ),
    });
    if (!post) throw new Error("Content does not belong to this brand.");
  }
  await validateAssets(document, brand.id);
  const [row] = await db
    .insert(productionPacketTable)
    .values({
      organizationId: input.organizationId,
      brandId: brand.id,
      contentPostId: input.contentPostId,
      createdBy: input.userId,
      title: input.title,
      documentType: document.type,
      document,
      prompt: document.brief.direction,
      purpose: document.brief.purpose,
      status: "draft",
    })
    .returning();
  if (!row) throw new Error("Could not create document.");
  return row;
}
export async function saveCreativeDocument(
  input: Identity & { documentId: string; document: CreativeDocument },
) {
  const parsed = creativeDocumentSchema.parse(input.document);
  const current = await getCreativeDocument(
    input.documentId,
    input.organizationId,
  );
  if (current.documentType !== parsed.type)
    throw new Error("Document type cannot be changed.");
  if (
    parsed.type === "article" &&
    current.document.type === "article" &&
    parsed.content.bodyMarkdown !== current.document.content.bodyMarkdown
  )
    delete parsed.content.datoBody;
  if (
    parsed.type === "article" &&
    current.document.type === "article" &&
    parsed.content.authorName !== current.document.content.authorName
  )
    delete parsed.content.datoAuthorId;
  await validateAssets(parsed, current.brandId);
  return withTransaction(async (tx) => {
    await lockDocument(tx, current.id, input.organizationId);
    await assertUnlocked(tx, current.id);
    const [row] = await tx
      .update(productionPacketTable)
      .set({
        document: parsed,
        prompt: parsed.brief.direction,
        purpose: parsed.brief.purpose,
        updatedAt: new Date(),
      })
      .where(eq(productionPacketTable.id, current.id))
      .returning();
    return row!;
  });
}
export async function selectCreativeDocument(
  input: Identity & { documentId: string; platformPostId: string },
) {
  return withTransaction(async (tx) => {
    const [spot] = await tx
      .select()
      .from(platformPostTable)
      .where(eq(platformPostTable.id, input.platformPostId))
      .for("update");
    const old = await tx.query.platformDocumentTable.findFirst({
      where: eq(platformDocumentTable.platformPostId, input.platformPostId),
    });
    for (const id of [
      ...new Set([input.documentId, ...(old ? [old.documentId] : [])]),
    ].sort()) {
      await lockDocument(tx, id, input.organizationId);
      await assertUnlocked(tx, id);
    }
    const document = (await tx.query.productionPacketTable.findFirst({
      where: eq(productionPacketTable.id, input.documentId),
    }))!;
    if (
      spot?.source !== "owned" ||
      spot.brandId !== document.brandId ||
      !document.contentPostId ||
      spot.contentPostId !== document.contentPostId
    )
      throw new Error(
        "The channel version and document must belong to the same content post and brand.",
      );
    if (
      (spot.platform === "newsletter" && document.documentType !== "email") ||
      (spot.platform === "blog" && document.documentType !== "article") ||
      (!["newsletter", "blog"].includes(spot.platform) &&
        !["image", "video"].includes(document.documentType))
    )
      throw new Error("Document type does not match the channel.");
    await tx
      .insert(platformDocumentTable)
      .values({ platformPostId: spot.id, documentId: document.id })
      .onConflictDoUpdate({
        target: platformDocumentTable.platformPostId,
        set: { documentId: document.id },
      });
    const creative = creativeDocumentSchema.parse(document.document);
    if (
      (creative.type === "image" || creative.type === "video") &&
      creative.content.selectedAssetId
    ) {
      await validateAssets(creative, document.brandId);
      const asset = await tx.query.mediaAssetTable.findFirst({
        where: eq(mediaAssetTable.id, creative.content.selectedAssetId),
      });
      if (!asset?.url) throw new Error("Selected media has no usable URL.");
      await tx
        .update(platformPostTable)
        .set({
          media: [
            {
              type: creative.type,
              assetId: asset.id,
              url: asset.url,
              ...(asset.width ? { width: asset.width } : {}),
              ...(asset.height ? { height: asset.height } : {}),
            },
          ],
        })
        .where(eq(platformPostTable.id, spot.id));
    }
    return { documentId: document.id, platformPostId: spot.id };
  });
}
export async function documentForPlatform(
  platformPostId: string,
  organizationId: string,
) {
  const link = await db.query.platformDocumentTable.findFirst({
    where: eq(platformDocumentTable.platformPostId, platformPostId),
  });
  return link ? getCreativeDocument(link.documentId, organizationId) : null;
}
export async function beginDocumentRun(
  input: Identity & {
    documentId: string;
    operation: string;
    provider: string;
    model: string;
    extra?: Record<string, unknown>;
  },
) {
  return withTransaction(async (tx) => {
    const row = await lockDocument(tx, input.documentId, input.organizationId);
    await assertUnlocked(tx, row.id);
    const document = creativeDocumentSchema.parse(row.document);
    await validateAssets(document, row.brandId);
    const [run] = await tx
      .insert(creativeRunTable)
      .values({
        organizationId: input.organizationId,
        brandId: row.brandId,
        contentPostId: row.contentPostId,
        packetId: row.id,
        createdBy: input.userId,
        provider: input.provider,
        model: input.model,
        kind: document.type,
        operation: input.operation,
        prompt: document.brief.direction,
        input: { ...input.extra, document },
        expiresAt: new Date(Date.now() + 20 * 60_000),
      })
      .returning();
    return run!;
  });
}
export async function claimDocumentRun(runId: string) {
  const [run] = await db
    .update(creativeRunTable)
    .set({ status: "processing" })
    .where(
      and(
        eq(creativeRunTable.id, runId),
        eq(creativeRunTable.status, "queued"),
        sql`${creativeRunTable.expiresAt} > now()`,
      ),
    )
    .returning();
  return run;
}
export async function finishDocumentRun(
  runId: string,
  result?: CreativeDocument,
  providerOutput?: Record<string, unknown>,
) {
  const run = await db.query.creativeRunTable.findFirst({
    where: eq(creativeRunTable.id, runId),
  });
  if (!run?.packetId) throw new Error("Document run not found.");
  const parsed = result ? creativeDocumentSchema.parse(result) : undefined;
  if (parsed) {
    if (parsed.type !== run.kind)
      throw new Error("Result type does not match the run.");
    await validateAssets(parsed, run.brandId);
  }
  return withTransaction(async (tx) => {
    await lockDocument(tx, run.packetId!, run.organizationId);
    const [finished] = await tx
      .update(creativeRunTable)
      .set({
        status: "ready",
        result: parsed,
        providerOutput,
        completedAt: new Date(),
      })
      .where(
        and(
          eq(creativeRunTable.id, runId),
          eq(creativeRunTable.status, "processing"),
          sql`${creativeRunTable.expiresAt} > now()`,
        ),
      )
      .returning();
    if (!finished) return false;
    if (parsed)
      await tx
        .update(productionPacketTable)
        .set({ document: parsed, updatedAt: new Date() })
        .where(eq(productionPacketTable.id, run.packetId!));
    return true;
  });
}
export async function failDocumentRun(runId: string, error: unknown) {
  await db
    .update(creativeRunTable)
    .set({
      status: "error",
      error: error instanceof Error ? error.message : "Production failed",
      completedAt: new Date(),
    })
    .where(
      and(
        eq(creativeRunTable.id, runId),
        inArray(creativeRunTable.status, ["queued", "processing"]),
      ),
    );
}
export async function cancelDocumentRun(runId: string, organizationId: string) {
  const run = await db.query.creativeRunTable.findFirst({
    where: and(
      eq(creativeRunTable.id, runId),
      eq(creativeRunTable.organizationId, organizationId),
    ),
  });
  if (!run?.packetId) throw new Error("Document run not found.");
  if (run.provider === "datocms")
    throw new Error("A dispatched Dato transfer cannot be cancelled.");
  return withTransaction(async (tx) => {
    await lockDocument(tx, run.packetId!, organizationId);
    await tx
      .update(creativeRunTable)
      .set({ status: "cancelled", completedAt: new Date() })
      .where(
        and(
          eq(creativeRunTable.id, runId),
          inArray(creativeRunTable.status, ["queued", "processing"]),
        ),
      );
    return { cancelled: true };
  });
}
export async function latestDocumentRun(
  documentId: string,
  organizationId: string,
) {
  await withTransaction(async (tx) => {
    await lockDocument(tx, documentId, organizationId);
  });
  return db.query.creativeRunTable.findFirst({
    where: and(
      eq(creativeRunTable.packetId, documentId),
      eq(creativeRunTable.organizationId, organizationId),
    ),
    orderBy: [desc(creativeRunTable.createdAt)],
  });
}
