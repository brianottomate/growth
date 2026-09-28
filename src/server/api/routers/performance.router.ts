import { z } from "zod";
import { setBrandStages } from "@/server/services/brand-relationship.service";
import { BUSINESS_STAGES, DELIVERY_STAGES } from "@/lib/performance-stage";
import { markCycleLinePaid } from "@/server/services/performance-billing.service";

import { workspaceProcedure, actionProcedure } from "@/server/api/orpc";
import {
  listPerformanceAccountsAction,
  getPerformanceAccountAction,
  createPerformanceAccountAction,
  updatePerformanceAccountAction,
  addPerformancePropertyAction,
  updatePerformancePropertyAction,
  openPerformanceCycleAction,
  updatePerformanceCycleAction,
  searchAttachableCampaignsAction,
  attachToPerformanceCycleAction,
  listSponsoredAbandonmentAction,
  refreshPerformanceCycleSpendAction,
  promoteToClientAction,
  clientCampaignContextAction,
  previewIntakeApplyAction,
  applyIntakeAction,
  verifyIntakeAccessAction,
} from "@/server/ai/capabilities/performance";

// Performance accounts (/app/performance/accounts) — the clients paying for
// Wander to run their marketing. Replaces the "Performance Dashboard" sheet.
// Delivery itself stays in campaign / lifecycle / amplification; this is the
// commercial layer plus a read of what is attached to each cycle.

export const performanceRouter = {
  list: actionProcedure(listPerformanceAccountsAction),

  get: actionProcedure(getPerformanceAccountAction),

  createAccount: actionProcedure(createPerformanceAccountAction),

  updateAccount: actionProcedure(updatePerformanceAccountAction),

  addProperty: actionProcedure(addPerformancePropertyAction),

  updateProperty: actionProcedure(updatePerformancePropertyAction),

  openCycle: actionProcedure(openPerformanceCycleAction),

  updateCycle: actionProcedure(updatePerformanceCycleAction),

  attachableCampaigns: actionProcedure(searchAttachableCampaignsAction),

  attach: actionProcedure(attachToPerformanceCycleAction),

  sponsoredAbandonment: actionProcedure(listSponsoredAbandonmentAction),

  refreshSpend: actionProcedure(refreshPerformanceCycleSpendAction),

  // ---- relationship -------------------------------------------------------

  // The signature event. Creates the commercial record if a client signed
  // before ever filling the form, which is the ordinary case for a deal an AE
  // closed on a call.
  promoteToClient: actionProcedure(promoteToClientAction),

  /** The ⋯ dialog: either lifecycle, any stage; the relationship follows business. */
  setStage: workspaceProcedure
    .input(
      z.object({
        brandId: z.string().min(1),
        business: z.enum(BUSINESS_STAGES).optional(),
        delivery: z.enum(DELIVERY_STAGES).optional(),
      }),
    )
    .handler(async ({ context: ctx, input }) => {
      const actor = { orgId: ctx.workspace.orgId };
      // "Paid" on the brand means the fee cleared, so it lands on the cycle too.
      if (input.business === "paid") {
        await markCycleLinePaid(actor, {
          brandId: input.brandId,
          line: "fee",
          paid: true,
        });
      }
      return setBrandStages(actor, input);
    }),

  /** One line of this month's cycle: the fee or the media, paid or reopened. */
  markLinePaid: workspaceProcedure
    .input(
      z.object({
        brandId: z.string().min(1),
        line: z.enum(["fee", "media"]),
        paid: z.boolean(),
      }),
    )
    .handler(async ({ context: ctx, input }) =>
      markCycleLinePaid({ orgId: ctx.workspace.orgId }, input),
    ),

  // What a new campaign draft opens with for a Performance client.
  campaignPrefill: actionProcedure(clientCampaignContextAction),

  previewIntakeApply: actionProcedure(previewIntakeApplyAction),
  applyIntake: actionProcedure(applyIntakeAction),
  verifyIntakeAccess: actionProcedure(verifyIntakeAccessAction),
};
