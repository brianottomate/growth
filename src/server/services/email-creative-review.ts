import { and, eq, inArray } from "drizzle-orm";
import type { TransactionClient } from "@/server/db";
import { platformDocumentTable, platformPostTable } from "@/server/db/schema";

export function nextEmailReviewStatus(
  status: string,
  action: "ready" | "approve" | "reopen",
) {
  if (action === "ready" && ["draft", "slot"].includes(status))
    return "pending_review" as const;
  if (action === "approve" && status === "pending_review")
    return "approved" as const;
  if (action === "reopen" && status === "approved") return "draft" as const;
  throw new Error(
    "This email's review status changed. Refresh before reviewing it.",
  );
}

export async function assertEmailCreativeEditable(
  tx: Pick<TransactionClient, "select">,
  documentId: string,
) {
  const approved = await tx
    .select({ id: platformPostTable.id })
    .from(platformDocumentTable)
    .innerJoin(
      platformPostTable,
      eq(platformPostTable.id, platformDocumentTable.platformPostId),
    )
    .where(
      and(
        eq(platformDocumentTable.documentId, documentId),
        eq(platformPostTable.platform, "newsletter"),
        inArray(platformPostTable.status, [
          "approved",
          "scheduled",
          "published",
        ]),
      ),
    )
    .limit(1);
  if (approved.length)
    throw new Error("This email is approved. Reopen it before editing.");
}
