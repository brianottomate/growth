import "server-only";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import type { z } from "zod";
import { db, withTransaction, type TransactionClient } from "@/server/db";
import {
  referenceBoardTable as boards,
  boardReferenceTable as refs,
  boardProposalTable as proposals,
  brandTable,
  brandInspirationTable,
  platformPostTable,
  mediaAssetTable,
  contentPostTable,
  adTable,
} from "@/server/db/schema";
import {
  boardFieldsSchema,
  boardProposalSchema,
  type BoardProposal,
  type boardSourceSchema,
} from "@/lib/reference-board";
import { withIdeaStudio } from "@/lib/ad-idea-studio";
import { createId } from "@/server/db/utils";

type Client = typeof db | TransactionClient;
type Source = z.infer<typeof boardSourceSchema>;
async function ownedBrand(client: Client, orgId: string, brandId: string) {
  const [brand] = await client
    .select()
    .from(brandTable)
    .where(
      and(
        eq(brandTable.id, brandId),
        eq(brandTable.organizationId, orgId),
        isNull(brandTable.deletedAt),
      ),
    );
  if (!brand) throw new Error("Brand not found in this workspace.");
  return brand;
}
async function boardFor(
  client: Client,
  orgId: string,
  id: string,
  lock = false,
) {
  const query = client
    .select({
      board: boards,
      brandName: brandTable.name,
      brandSlug: brandTable.slug,
    })
    .from(boards)
    .innerJoin(brandTable, eq(brandTable.id, boards.brandId))
    .where(
      and(
        eq(boards.id, id),
        eq(boards.organizationId, orgId),
        eq(brandTable.organizationId, orgId),
        isNull(brandTable.deletedAt),
      ),
    );
  const [row] = await (lock ? query.for("update") : query);
  if (!row) throw new Error("Reference board not found.");
  return row;
}
function editable(board: typeof boards.$inferSelect) {
  if (board.archived) throw new Error("Restore this board before editing it.");
}
function boardView(row: {
  board: typeof boards.$inferSelect;
  brandName: string;
}) {
  return {
    id: row.board.id,
    brandId: row.board.brandId,
    brandName: row.brandName,
    name: row.board.name,
    brief: row.board.brief,
    archived: row.board.archived,
    updatedAt: row.board.updatedAt.toISOString(),
  };
}
function webUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? value : null;
  } catch {
    return null;
  }
}
/** Resolve current ownership on every read; never retain a private source snapshot. */
async function sourceView(client: Client, orgId: string, source: Source) {
  const post =
    source.kind === "post"
      ? await client.query.platformPostTable.findFirst({
          where: eq(platformPostTable.id, source.id),
        })
      : null;
  const asset =
    source.kind === "media"
      ? await client.query.mediaAssetTable.findFirst({
          where: and(
            eq(mediaAssetTable.id, source.id),
            isNull(mediaAssetTable.deletedAt),
            eq(mediaAssetTable.status, "ready"),
            eq(mediaAssetTable.reviewStatus, "approved"),
          ),
        })
      : null;
  const brandId = post?.brandId ?? asset?.brandId;
  if (
    !brandId ||
    (post &&
      (!post.publishedAt || post.cleanupStatus === "deleted" || post.isSeed))
  )
    return null;
  const brand = await client.query.brandTable.findFirst({
    where: and(eq(brandTable.id, brandId), isNull(brandTable.deletedAt)),
  });
  if (!brand) return null;
  if (brand.organizationId !== orgId) {
    if (brand.organizationId || asset) return null;
    const [link] = await client
      .select({ id: brandInspirationTable.id })
      .from(brandInspirationTable)
      .innerJoin(brandTable, eq(brandTable.id, brandInspirationTable.brandId))
      .where(
        and(
          eq(brandInspirationTable.inspirationBrandId, brand.id),
          eq(brandTable.organizationId, orgId),
          isNull(brandTable.deletedAt),
        ),
      )
      .limit(1);
    if (!link) return null;
  }
  const media = post?.media?.[0];
  return {
    title: asset?.title ?? `${brand.name} · ${post?.platform ?? "Media"}`,
    brandName: brand.name,
    text: post?.text ?? asset?.alt ?? null,
    url: webUrl(post?.externalUrl ?? asset?.externalUrl ?? asset?.url),
    imageUrl: webUrl(
      media
        ? (media.thumbnail ?? (media.type === "image" ? media.url : null))
        : (asset?.thumbnailUrl ?? (asset?.kind === "image" ? asset.url : null)),
    ),
  };
}
function sourceOf(ref: typeof refs.$inferSelect): Source | null {
  return ref.platformPostId
    ? { kind: "post", id: ref.platformPostId }
    : ref.mediaAssetId
      ? { kind: "media", id: ref.mediaAssetId }
      : null;
}
function draftUrl(proposal: typeof proposals.$inferSelect, brandSlug: string) {
  return proposal.contentPostId
    ? `/app/content/${proposal.contentPostId}`
    : proposal.adId
      ? `/app/performance/clients/${encodeURIComponent(brandSlug)}/ads#ad-${proposal.adId}`
      : null;
}
async function proposalView(
  client: Client,
  proposal: typeof proposals.$inferSelect,
  brandId: string,
  brandSlug: string,
) {
  // A downstream record can be deleted or moved independently; don't expose its new owner.
  const draft = proposal.contentPostId
    ? await client.query.contentPostTable.findFirst({
        where: and(
          eq(contentPostTable.id, proposal.contentPostId),
          eq(contentPostTable.brandId, brandId),
          isNull(contentPostTable.deletedAt),
        ),
        columns: { id: true },
      })
    : proposal.adId
      ? await client.query.adTable.findFirst({
          where: and(
            eq(adTable.id, proposal.adId),
            eq(adTable.brandId, brandId),
          ),
          columns: { id: true },
        })
      : null;
  return {
    id: proposal.id,
    document: proposal.document,
    acceptedAt: proposal.acceptedAt?.toISOString() ?? null,
    draftUrl: draft ? draftUrl(proposal, brandSlug) : null,
  };
}
export async function listReferenceBoards(orgId: string) {
  const [rows, brands] = await Promise.all([
    db
      .select({
        board: boards,
        brandName: brandTable.name,
        brandSlug: brandTable.slug,
      })
      .from(boards)
      .innerJoin(brandTable, eq(brandTable.id, boards.brandId))
      .where(
        and(
          eq(boards.organizationId, orgId),
          eq(brandTable.organizationId, orgId),
          isNull(brandTable.deletedAt),
        ),
      )
      .orderBy(desc(boards.updatedAt)),
    db
      .select({ id: brandTable.id, name: brandTable.name })
      .from(brandTable)
      .where(
        and(eq(brandTable.organizationId, orgId), isNull(brandTable.deletedAt)),
      )
      .orderBy(brandTable.name),
  ]);
  return { boards: rows.map(boardView), brands };
}
export async function getReferenceBoard(orgId: string, id: string) {
  const row = await boardFor(db, orgId, id);
  const [references, proposalRows] = await Promise.all([
    db
      .select()
      .from(refs)
      .where(eq(refs.boardId, id))
      .orderBy(asc(refs.position), asc(refs.id)),
    db
      .select()
      .from(proposals)
      .where(eq(proposals.boardId, id))
      .orderBy(desc(proposals.createdAt)),
  ]);
  return {
    board: boardView(row),
    references: await Promise.all(
      references.map(async (ref) => {
        const source = sourceOf(ref);
        const view = source ? await sourceView(db, orgId, source) : null;
        return {
          id: ref.id,
          note: ref.note,
          position: ref.position,
          source: view ? source : null,
          view,
        };
      }),
    ),
    proposals: await Promise.all(
      proposalRows.map((p) =>
        proposalView(
          db,
          p,
          row.board.brandId,
          row.brandSlug ?? row.board.brandId,
        ),
      ),
    ),
  };
}
export async function saveReferenceBoard(
  orgId: string,
  input: z.infer<typeof boardFieldsSchema> & { id?: string; brandId: string },
) {
  const fields = boardFieldsSchema.parse(input);
  const id = await withTransaction(async (tx) => {
    if (input.id) {
      const { board } = await boardFor(tx, orgId, input.id, true);
      if (board.brandId !== input.brandId)
        throw new Error("A board stays with its original brand.");
      await tx.update(boards).set(fields).where(eq(boards.id, board.id));
      return board.id;
    }
    await ownedBrand(tx, orgId, input.brandId);
    const [row] = await tx
      .insert(boards)
      .values({ ...fields, organizationId: orgId, brandId: input.brandId })
      .returning({ id: boards.id });
    return row!.id;
  });
  return getReferenceBoard(orgId, id);
}
export async function addBoardReference(
  orgId: string,
  input: { boardId: string; source: Source; note: string },
) {
  await withTransaction(async (tx) => {
    const { board } = await boardFor(tx, orgId, input.boardId, true);
    editable(board);
    if (!(await sourceView(tx, orgId, input.source)))
      throw new Error(
        "Choose a visible published post or approved workspace media.",
      );
    const [last] = await tx
      .select({ position: refs.position })
      .from(refs)
      .where(eq(refs.boardId, board.id))
      .orderBy(desc(refs.position))
      .limit(1);
    await tx.insert(refs).values({
      boardId: board.id,
      platformPostId: input.source.kind === "post" ? input.source.id : null,
      mediaAssetId: input.source.kind === "media" ? input.source.id : null,
      note: input.note,
      position: (last?.position ?? -1) + 1,
    });
    await tx
      .update(boards)
      .set({ updatedAt: new Date() })
      .where(eq(boards.id, board.id));
  });
  return getReferenceBoard(orgId, input.boardId);
}
export async function editBoardReferences(
  orgId: string,
  input: {
    boardId: string;
    entries: { id: string; note?: string }[];
    reorder?: boolean;
    removeId?: string;
  },
) {
  await withTransaction(async (tx) => {
    const { board } = await boardFor(tx, orgId, input.boardId, true);
    editable(board);
    const existing = await tx
      .select()
      .from(refs)
      .where(eq(refs.boardId, board.id))
      .orderBy(asc(refs.position), asc(refs.id));
    const ids = new Set(existing.map((r) => r.id));
    if (
      input.entries.some((e) => !ids.has(e.id)) ||
      (input.removeId && !ids.has(input.removeId))
    )
      throw new Error("Reference not found on this board.");
    if (input.removeId)
      await tx
        .delete(refs)
        .where(and(eq(refs.id, input.removeId), eq(refs.boardId, board.id)));
    const requested = new Set(input.entries.map((e) => e.id));
    const ordered = (
      input.reorder
        ? [...input.entries, ...existing.filter((e) => !requested.has(e.id))]
        : input.entries
    ).filter((e) => e.id !== input.removeId);
    for (const [position, entry] of ordered.entries()) {
      if (!input.reorder && entry.note === undefined) continue;
      await tx
        .update(refs)
        .set({
          ...(entry.note !== undefined ? { note: entry.note } : {}),
          ...(input.reorder ? { position } : {}),
        })
        .where(and(eq(refs.id, entry.id), eq(refs.boardId, board.id)));
    }
    await tx
      .update(boards)
      .set({ updatedAt: new Date() })
      .where(eq(boards.id, board.id));
  });
  return getReferenceBoard(orgId, input.boardId);
}
async function validateReferences(
  tx: TransactionClient,
  orgId: string,
  boardId: string,
  ids: string[],
) {
  if (!ids.length) return;
  const rows = await tx
    .select()
    .from(refs)
    .where(and(eq(refs.boardId, boardId), inArray(refs.id, ids)));
  if (rows.length !== new Set(ids).size)
    throw new Error(
      "One of the selected references is no longer on this board.",
    );
  for (const ref of rows) {
    const source = sourceOf(ref);
    if (!source || !(await sourceView(tx, orgId, source)))
      throw new Error(
        "A selected reference is unavailable. Update the proposal's references first.",
      );
  }
}
export async function saveBoardProposal(
  orgId: string,
  input: { boardId: string; id?: string; document: BoardProposal },
) {
  const document = boardProposalSchema.parse(input.document);
  await withTransaction(async (tx) => {
    const { board } = await boardFor(tx, orgId, input.boardId, true);
    editable(board);
    await validateReferences(tx, orgId, board.id, document.referenceIds);
    if (input.id) {
      const [row] = await tx
        .select()
        .from(proposals)
        .where(
          and(eq(proposals.id, input.id), eq(proposals.boardId, board.id)),
        );
      if (!row) throw new Error("Proposal not found.");
      if (row.acceptedAt)
        throw new Error(
          "This proposal has been accepted. Edit its draft or create another proposal.",
        );
      await tx
        .update(proposals)
        .set({ document })
        .where(eq(proposals.id, row.id));
    } else await tx.insert(proposals).values({ boardId: board.id, document });
    await tx
      .update(boards)
      .set({ updatedAt: new Date() })
      .where(eq(boards.id, board.id));
  });
  return getReferenceBoard(orgId, input.boardId);
}
export async function acceptBoardProposal(
  orgId: string,
  userId: string,
  input: { boardId: string; id: string; reviewed: BoardProposal },
) {
  await withTransaction(async (tx) => {
    const { board } = await boardFor(tx, orgId, input.boardId, true);
    const [proposal] = await tx
      .select()
      .from(proposals)
      .where(and(eq(proposals.id, input.id), eq(proposals.boardId, board.id)))
      .for("update");
    if (!proposal) throw new Error("Proposal not found.");
    if (proposal.acceptedAt) return;
    editable(board);
    const document = boardProposalSchema.parse(proposal.document);
    if (
      JSON.stringify(document) !==
      JSON.stringify(boardProposalSchema.parse(input.reviewed))
    )
      throw new Error(
        "The proposal changed. Review the saved proposal before accepting it.",
      );
    await validateReferences(tx, orgId, board.id, document.referenceIds);
    let contentPostId: string | null = null;
    let adId: string | null = null;
    if (document.kind === "content") {
      contentPostId = createId("post");
      await tx.insert(contentPostTable).values({
        id: contentPostId,
        brandId: board.brandId,
        title: document.title,
        hook: document.hook,
        captionDirection: document.copy,
        visualDirection: document.visualDirection,
        ctaText: document.cta,
        ownerId: userId,
        createdById: userId,
        status: "draft",
        origin: "human",
      });
    } else {
      adId = createId("ad");
      await tx.insert(adTable).values(
        withIdeaStudio({
          id: adId,
          brandId: board.brandId,
          name: document.title,
          type: "creative" as const,
          content: {
            headline: document.hook,
            body: document.copy,
            callToAction: document.cta,
            media: [],
          },
        }),
      );
    }
    await tx
      .update(proposals)
      .set({ contentPostId, adId, acceptedAt: new Date() })
      .where(eq(proposals.id, proposal.id));
    await tx
      .update(boards)
      .set({ updatedAt: new Date() })
      .where(eq(boards.id, board.id));
  });
  return getReferenceBoard(orgId, input.boardId);
}
export async function referenceMediaOptions(orgId: string, brandId: string) {
  await ownedBrand(db, orgId, brandId);
  const assets = await db
    .select({
      id: mediaAssetTable.id,
      title: mediaAssetTable.title,
      filename: mediaAssetTable.filename,
    })
    .from(mediaAssetTable)
    .where(
      and(
        eq(mediaAssetTable.brandId, brandId),
        eq(mediaAssetTable.status, "ready"),
        eq(mediaAssetTable.reviewStatus, "approved"),
        isNull(mediaAssetTable.deletedAt),
      ),
    )
    .orderBy(desc(mediaAssetTable.createdAt))
    .limit(200);
  return {
    assets: assets.map((a) => ({
      id: a.id,
      title: a.title ?? a.filename ?? a.id,
    })),
  };
}
