import { CreativeDocumentWorkspace } from "./workspace";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/server/better-auth/server";
import { db } from "@/server/db";
import {
  memberTable,
  platformDocumentTable,
  platformPostTable,
  productionPacketTable,
} from "@/server/db/schema";
export default async function CreativeDocumentPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  const session = await getSession();
  if (!session?.user) redirect("/signin");
  const [selected] = await db
    .select({ platform: platformPostTable.platform, id: platformPostTable.id })
    .from(platformDocumentTable)
    .innerJoin(
      platformPostTable,
      eq(platformPostTable.id, platformDocumentTable.platformPostId),
    )
    .innerJoin(
      productionPacketTable,
      eq(productionPacketTable.id, platformDocumentTable.documentId),
    )
    .innerJoin(
      memberTable,
      and(
        eq(memberTable.organizationId, productionPacketTable.organizationId),
        eq(memberTable.userId, session.user.id),
      ),
    )
    .where(eq(platformDocumentTable.documentId, documentId))
    .limit(1);
  if (selected?.platform === "blog") redirect(`/app/blog/${selected.id}`);
  if (selected?.platform === "newsletter")
    redirect(`/app/newsletters/${selected.id}`);
  return <CreativeDocumentWorkspace documentId={documentId} />;
}
