import "server-only";
import { createHash } from "node:crypto";

import { and, asc, eq, gt, inArray, or, sql } from "drizzle-orm";

import {
  emailAudienceRecipientSchema,
  type EmailAudienceRecipient,
} from "@/lib/email-audience";
import { db, withTransaction } from "@/server/db";
import { emailListMemberTable, emailListTable } from "@/server/db/schema";

const INSERT_CHUNK = 1000;

export type EmailListUploadRow = {
  email: string;
  firstName: string | null;
  lastName?: string | null;
  sourceId: string | null;
};

/** Form-spam signups fill names with strings like "GYCETzIUgVASAdh". */
function looksGenerated(name: string) {
  if (!/^[A-Za-z]{8,}$/.test(name)) return false;
  return (name.slice(1).match(/[A-Z]/g)?.length ?? 0) >= 3;
}

const sampleRank = (email: string) =>
  createHash("sha256").update(email).digest("hex");

function normalizeEmailListRows(rows: EmailListUploadRow[]) {
  const members = new Map<string, typeof emailListMemberTable.$inferInsert>();
  let invalidCount = 0;
  let duplicateCount = 0;
  let namesCleared = 0;
  for (const row of rows) {
    const email = row.email.trim().toLowerCase();
    if (!emailAudienceRecipientSchema.shape.email.safeParse(email).success) {
      invalidCount += 1;
      continue;
    }
    if (members.has(email)) {
      duplicateCount += 1;
      continue;
    }
    const firstName = row.firstName?.trim() || null;
    const generated = firstName !== null && looksGenerated(firstName);
    if (generated) namesCleared += 1;
    members.set(email, {
      listId: "",
      email,
      firstName: generated ? null : firstName,
      lastName: row.lastName?.trim() || null,
      sourceId: row.sourceId?.trim() || null,
      sampleRank: sampleRank(email),
    });
  }
  if (!members.size) throw new Error("The list has no valid email addresses.");

  return { members, invalidCount, duplicateCount, namesCleared };
}

/**
 * Store an operator's list for a brand. Rows are cleaned here, once:
 * lowercased, deduplicated, invalid addresses dropped, and bot-generated
 * first names cleared so `{{first_name|there}}` falls back.
 */
export async function createEmailList(input: {
  brandId: string;
  name: string;
  fileName: string | null;
  createdBy: string;
  rows: EmailListUploadRow[];
}) {
  const { members, invalidCount, duplicateCount, namesCleared } =
    normalizeEmailListRows(input.rows);

  return withTransaction(async (tx) => {
    const [list] = await tx
      .insert(emailListTable)
      .values({
        brandId: input.brandId,
        name: input.name,
        fileName: input.fileName,
        invalidCount,
        duplicateCount,
        namesCleared,
        createdBy: input.createdBy,
      })
      .returning();
    const rows = [...members.values()].map((m) => ({ ...m, listId: list!.id }));
    for (let i = 0; i < rows.length; i += INSERT_CHUNK)
      await tx
        .insert(emailListMemberTable)
        .values(rows.slice(i, i + INSERT_CHUNK));
    return { ...list!, imported: members.size };
  });
}

/** The list, only if it belongs to the brand. */
export async function requireBrandEmailList(listId: string, brandId: string) {
  const list = await db.query.emailListTable.findFirst({
    where: eq(emailListTable.id, listId),
  });
  if (list?.brandId !== brandId)
    throw new Error("That list belongs to another brand.");
  return list;
}

const toRecipient = (
  list: { name: string },
  member: { email: string; firstName: string | null; sourceId: string | null },
): EmailAudienceRecipient => ({
  email: member.email,
  first_name: member.firstName,
  source_id: member.sourceId ?? member.email,
  reason: `Uploaded list: ${list.name}`,
});

/** Ten members by email, for the preview. */
export async function previewEmailListMembers(list: {
  id: string;
  name: string;
}) {
  const members = await db
    .select()
    .from(emailListMemberTable)
    .where(eq(emailListMemberTable.listId, list.id))
    .orderBy(asc(emailListMemberTable.email))
    .limit(10);
  return members.map((member) => toRecipient(list, member));
}

/**
 * One page of the audience in sample order. The token is
 * `<served>:<rank>:<email>` of the last member served, so the next page continues
 * where the previous page stopped and never serves past the sample size.
 */
export async function readEmailListPage(input: {
  list: { id: string; name: string };
  sampleSize: number | null;
  pageSize: number;
  pageToken?: string;
}) {
  const [servedText, rank, email] = input.pageToken?.split(":") ?? [];
  const served = Number(servedText ?? 0);
  const limit = input.sampleSize
    ? Math.min(input.pageSize, input.sampleSize - served)
    : input.pageSize;
  if (limit <= 0) return { recipients: [], nextPageToken: null };
  const members = await db
    .select()
    .from(emailListMemberTable)
    .where(
      and(
        eq(emailListMemberTable.listId, input.list.id),
        rank && email
          ? or(
              gt(emailListMemberTable.sampleRank, rank),
              and(
                eq(emailListMemberTable.sampleRank, rank),
                gt(emailListMemberTable.email, email),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(
      asc(emailListMemberTable.sampleRank),
      asc(emailListMemberTable.email),
    )
    .limit(limit);
  const last = members.at(-1);
  const total = served + members.length;
  const done =
    members.length < limit ||
    (input.sampleSize !== null && total >= input.sampleSize);
  return {
    recipients: members.map((member) => toRecipient(input.list, member)),
    nextPageToken:
      done || !last ? null : `${total}:${last.sampleRank}:${last.email}`,
  };
}

/** Append membership to the same list identity; future editions see the new rows. */
export async function appendEmailListMembers(input: {
  listId: string;
  brandId: string;
  rows: EmailListUploadRow[];
}) {
  const { members, invalidCount, duplicateCount, namesCleared } =
    normalizeEmailListRows(input.rows);
  return withTransaction(async (tx) => {
    const [list] = await tx
      .select()
      .from(emailListTable)
      .where(
        and(
          eq(emailListTable.id, input.listId),
          eq(emailListTable.brandId, input.brandId),
        ),
      );
    if (!list) throw new Error("Email list not found on this brand.");
    const rows = [...members.values()].map((m) => ({ ...m, listId: list.id }));
    let imported = 0;
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const added = await tx
        .insert(emailListMemberTable)
        .values(rows.slice(i, i + INSERT_CHUNK))
        .onConflictDoNothing()
        .returning({ email: emailListMemberTable.email });
      imported += added.length;
    }
    return {
      imported,
      invalid: invalidCount,
      duplicates: duplicateCount + members.size - imported,
      namesCleared,
    };
  });
}

/** Counts come from membership rows, not a frozen compilation receipt. */
export async function emailListCounts(ids: string[]) {
  if (!ids.length) return new Map<string, number>();
  const rows = await db
    .select({
      id: emailListMemberTable.listId,
      count: sql<number>`count(*)::int`,
    })
    .from(emailListMemberTable)
    .where(inArray(emailListMemberTable.listId, ids))
    .groupBy(emailListMemberTable.listId);
  return new Map(rows.map((r) => [r.id, r.count]));
}
