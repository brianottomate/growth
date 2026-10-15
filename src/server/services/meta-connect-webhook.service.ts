import "server-only";

import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { zernioAdsSyncSchema } from "@/lib/zernio-webhook";
import { db } from "@/server/db";
import { brandTable, workflowRunTable } from "@/server/db/schema";
import { listZernioAccounts } from "@/server/clients/zernio.client";
import { connectBrandToZernioProfile } from "./zernio-brand.service";
import {
  completeMetaConnectSetup,
  loadMetaConnectAccounts,
} from "./meta-connect-setup.service";
import {
  claimWorkflowRun,
  failWorkflowRun,
  updateWorkflowRun,
} from "./workflow-run.service";

/** Signed provider event -> exact, uniquely owned profile. Persist before ack. */
export async function queueMetaConnectWebhook(
  input: z.infer<typeof zernioAdsSyncSchema>,
) {
  if (input.account.platform !== "metaads") return null;
  const brands = await db.query.brandTable.findMany({
    where: and(
      eq(brandTable.zernioProfileId, input.account.profileId),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true, organizationId: true },
  });
  if (brands.length !== 1 || !brands[0]?.organizationId) return null;
  const brand = brands[0];
  const id = `wrun_meta_${createHash("sha256").update(input.id).digest("hex")}`;
  const [run] = await db
    .insert(workflowRunTable)
    .values({
      id,
      brandId: brand.id,
      organizationId: brand.organizationId!,
      workflowType: "meta-connect-confirmation",
      lockKey: id,
      input,
      status: "queued",
      expiresAt: new Date(Date.now() + 2 * 60 * 60_000),
    })
    .onConflictDoNothing({ target: workflowRunTable.id })
    .returning({ id: workflowRunTable.id });
  return run?.id ?? null;
}

export async function runMetaConnectWebhook(runId: string) {
  const run = await claimWorkflowRun(runId, "meta-connect-confirmation");
  if (!run) return;
  try {
    const event = zernioAdsSyncSchema.parse(run.input);
    const brand = await db.query.brandTable.findFirst({
      where: and(
        eq(brandTable.id, run.brandId),
        eq(brandTable.organizationId, run.organizationId),
        eq(brandTable.zernioProfileId, event.account.profileId),
        isNull(brandTable.deletedAt),
      ),
      columns: { id: true },
    });
    const connection = (await listZernioAccounts()).find(
      (account) =>
        (account._id ?? account.id) === event.account.accountId &&
        account.platform === "metaads" &&
        (typeof account.profileId === "string"
          ? account.profileId
          : account.profileId?._id) === event.account.profileId,
    );
    if (!brand || !connection)
      throw new Error(
        "The webhook connection no longer belongs to this client",
      );
    if (event.sync.status !== "success")
      throw new Error(
        `Zernio initial ad sync failed: ${event.sync.errorCategory ?? "unknown"}`,
      );
    // Re-read live grants and the saved client choice. A synced account list
    // alone never overrides a selection or authorizes unrelated accounts.
    const context = await loadMetaConnectAccounts(brand.id);
    if (!context || context.connectionAccountId !== event.account.accountId)
      throw new Error(
        "The webhook is not for the client's active Meta connection",
      );
    await connectBrandToZernioProfile(brand.id, event.account.profileId);
    const scopeIds =
      event.account.platformAdAccountIds ??
      (event.account.platformAdAccountId
        ? [event.account.platformAdAccountId]
        : []);
    // A single provider-scoped destination can finish onboarding without a
    // browser return. Existing client choices always win over a delayed event.
    const scopedChoice =
      !context?.selectedId && scopeIds.length === 1 ? scopeIds[0] : undefined;
    const setup = await completeMetaConnectSetup(brand.id, {
      providerScopedAdAccountId: scopedChoice,
    });
    await updateWorkflowRun(run, {
      status: "succeeded",
      providerOutput: { sync: event.sync, setup: setup ?? null },
    });
  } catch (error) {
    await failWorkflowRun(run, error);
  }
}
