import "server-only";

import { and, eq } from "drizzle-orm";

import { canOperateEmailDelivery } from "@/lib/email-delivery-role";
import { db } from "@/server/db";
import { memberTable } from "@/server/db/schema";

export async function requireEmailDeliveryOperator(input: {
  organizationId: string;
  userId: string;
}) {
  const membership = await db.query.memberTable.findFirst({
    where: and(
      eq(memberTable.organizationId, input.organizationId),
      eq(memberTable.userId, input.userId),
    ),
    columns: { role: true },
  });
  if (!canOperateEmailDelivery(membership?.role)) {
    throw new Error(
      "Only organization owners and admins can prepare, test or operate email delivery.",
    );
  }
}
