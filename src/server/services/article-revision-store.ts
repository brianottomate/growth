import "server-only";
import { eq } from "drizzle-orm";
import { creativeDocumentSchema } from "@/lib/creative-document";
import type { TransactionClient } from "@/server/db";
import {
  articleRevisionTable,
  articleAcceptanceTable,
  type productionPacketTable,
} from "@/server/db/schema";

export async function preserveArticleDraft(
  tx: TransactionClient,
  row: typeof productionPacketTable.$inferSelect,
  source: string,
  userId?: string | null,
  invalidateAcceptance = true,
) {
  const document = creativeDocumentSchema.parse(row.document);
  if (document.type !== "article") return;
  if (invalidateAcceptance)
    await tx
      .delete(articleAcceptanceTable)
      .where(eq(articleAcceptanceTable.documentId, row.id));
  await tx.insert(articleRevisionTable).values({
    documentId: row.id,
    document,
    source,
    createdBy: userId,
    status: "history",
  });
}
