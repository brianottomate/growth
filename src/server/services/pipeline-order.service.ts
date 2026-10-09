import "server-only";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { withTransaction } from "@/server/db";
import { brandTable, userTable } from "@/server/db/schema";
import { pipelineStage, type PipelineStage } from "@/lib/performance-pipeline";
import { planPipelineOrder } from "@/lib/pipeline-order";
import { PerformanceError } from "./performance.service";

export async function movePipelineCard(input: {
  orgId: string;
  userId: string;
  brandId: string;
  stage: PipelineStage;
  beforeId: string | null;
}) {
  return withTransaction(async (tx) => {
    // Serialize moves on this org's shared board so simultaneous insertions get
    // different ranks. No revision checks: the latest move intent wins.
    const brands = await tx
      .select({
        id: brandTable.id,
        name: brandTable.name,
        relationship: brandTable.relationship,
        settings: brandTable.performanceSettings,
      })
      .from(brandTable)
      .where(
        and(
          eq(brandTable.organizationId, input.orgId),
          isNull(brandTable.deletedAt),
          inArray(brandTable.relationship, ["client", "prospect"]),
        ),
      )
      .orderBy(asc(brandTable.id))
      .for("update");
    const moved = brands.find((brand) => brand.id === input.brandId);
    if (!moved) throw new PerformanceError("NOT_FOUND", "Client not found");
    if (input.beforeId === moved.id)
      throw new PerformanceError(
        "BAD_REQUEST",
        "A card cannot be placed before itself",
      );
    const rows = brands
      .filter(
        (brand) =>
          pipelineStage({
            relationship: brand.relationship,
            pipelineStage: brand.settings?.pipelineStage,
          }) === input.stage,
      )
      .map((brand) => ({
        id: brand.id,
        name: brand.name,
        pipelineOrder: brand.settings?.pipelineOrder,
      }));
    if (input.beforeId && !rows.some((card) => card.id === input.beforeId))
      throw new PerformanceError(
        "BAD_REQUEST",
        "The destination card is no longer in this stage. Refresh and try again.",
      );
    const updates = planPipelineOrder(
      rows,
      { id: moved.id, name: moved.name },
      input.beforeId,
    );
    const editor = await tx.query.userTable.findFirst({
      where: eq(userTable.id, input.userId),
      columns: { name: true, email: true },
    });
    const updatedAt = new Date().toISOString();
    for (const [id, pipelineOrder] of updates) {
      const patch =
        id === moved.id
          ? {
              pipelineStage: input.stage,
              pipelineOrder,
              updatedAt,
              updatedBy: editor?.name ?? editor?.email ?? input.userId,
              updatedFrom: "operator",
            }
          : { pipelineOrder };
      await tx
        .update(brandTable)
        .set({
          performanceSettings: sql`coalesce(${brandTable.performanceSettings}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb`,
        })
        .where(
          and(
            eq(brandTable.id, id),
            eq(brandTable.organizationId, input.orgId),
          ),
        );
    }
    return { stage: input.stage, positions: Object.fromEntries(updates) };
  });
}
