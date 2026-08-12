import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/server/db";
import {
  hubspotListMembershipTable,
  leadDomainTable,
  leadSequenceTable,
  type LeadOutreach,
} from "@/server/db/leads-schema";
import {
  generatePregenHubspotDraft,
  PregenPreconditionError,
} from "@/server/services/pregen-hubspot-outreach.service";

export type GenerateSequenceOptions = {
  motion?: "fresh" | "reengagement";
  previewUrl?: string;
  steer?: string;
  /**
   * Iterate on copy before a real preview exists. The draft is marked and
   * publishing refuses it.
   */
  pretend?: boolean;
};

/**
 * Generate one pregen sequence draft and store it.
 *
 * Lifted out of the `leads.generatePregenOutreach` mutation so the overnight
 * batch pass and the per-row button cannot drift: the motion derivation, the
 * preview resolution and the exclusion refusal are the parts that decide
 * whether copy is publishable, and two copies of that is two answers.
 *
 * Throws `PregenPreconditionError` for the operator-actionable refusals
 * (excluded, no preview assigned, preview unreadable) so callers can surface
 * the reason rather than a stack trace.
 */
export async function generateAndStoreSequence(
  domainId: string,
  options: GenerateSequenceOptions = {},
): Promise<LeadOutreach> {
  const row = await db.query.leadDomainTable.findFirst({
    where: eq(leadDomainTable.id, domainId),
  });
  if (!row) throw new Error(`lead domain not found: ${domainId}`);

  // The enrich/merge passes already mark existing customers and rep-owned live
  // conversations. Prospecting copy is never right for those, and a draft
  // sitting in Send Review reads as cleared to send, so refuse at generation
  // rather than filtering it out downstream.
  if (row.excludeFromOutreach) {
    throw new PregenPreconditionError(
      row.domain,
      `${row.domain} is excluded from outreach (${row.excludeReason ?? "no reason recorded"})`,
    );
  }

  // Cohort membership is the source of truth for motion: a recycled company has
  // prior Wander outreach to acknowledge, an untouched one does not.
  let motion = options.motion;
  if (!motion) {
    const [membership] = await db
      .select({ cohort: hubspotListMembershipTable.cohort })
      .from(hubspotListMembershipTable)
      .where(
        and(
          eq(hubspotListMembershipTable.domainId, domainId),
          eq(hubspotListMembershipTable.objectType, "company"),
        ),
      )
      .limit(1);
    motion = membership?.cohort === "recycled" ? "reengagement" : "fresh";
  }

  // In pretend mode a company with no preview at all still gets a draft. The
  // stand-in is deliberately self-describing so it is obvious in a rendered body.
  const previewUrl =
    options.previewUrl ??
    row.pregenSiteUrl ??
    (options.pretend ? `https://preview.wander.com/pretend/${row.domain}` : null);
  if (!previewUrl) {
    throw new PregenPreconditionError(
      row.domain,
      "Assign a real pregen preview before generating HubSpot copy, or generate in pretend mode to iterate on the copy first",
    );
  }

  const result = await generatePregenHubspotDraft(row.domain, {
    motion,
    previewUrl,
    steer: options.steer,
    previewMode: options.pretend ? "pretend" : "require-live",
  });

  await db
    .delete(leadSequenceTable)
    .where(
      and(
        eq(leadSequenceTable.domainId, domainId),
        eq(leadSequenceTable.status, "draft"),
      ),
    );

  const [created] = await db
    .insert(leadSequenceTable)
    .values({
      domainId: row.id,
      domain: row.domain,
      status: "draft",
      angle: result.draft.angle,
      personalizedOn: [
        ...result.draft.personalizedOn,
        ...result.draft.historyUsed.map((value) => `History: ${value}`),
      ],
      steps: result.renderedSteps,
      generationContext: result.generationContext,
      model: result.model,
    })
    .returning();

  return created!;
}
