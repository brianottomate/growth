import { eq } from "drizzle-orm";
import { withTransaction } from "@/server/db";
import { attachmentTable } from "@/server/db/schema";

/**
 * Transfer all resources from an anonymous user to a newly created real user.
 * This is called when an anonymous user converts their account by signing up or signing in.
 *
 * The transfer includes:
 * - Attachments (uploadedBy)
 *
 * Add additional tables as needed for your application.
 */
export async function transferAnonymousUserData(
  fromUserId: string,
  toUserId: string,
): Promise<void> {
  console.log(
    `[Anonymous] Transferring data from ${fromUserId} to ${toUserId}`,
  );

  await withTransaction(async (tx) => {
    // Transfer attachments (uploadedBy)
    const attachmentsUpdated = await tx
      .update(attachmentTable)
      .set({ uploadedBy: toUserId })
      .where(eq(attachmentTable.uploadedBy, fromUserId));
    console.log(
      `[Anonymous] Transferred ${attachmentsUpdated.rowCount ?? 0} attachments`,
    );
  });

  console.log(
    `[Anonymous] Successfully transferred all data from ${fromUserId} to ${toUserId}`,
  );
}

// Export as a service object for consistency with other services
export const anonymousService = {
  transferAnonymousUserData,
};
