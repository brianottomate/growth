import { z } from "zod";
import {
  PAYMENT_STATES,
  performanceAmountSchema,
} from "./performance-card-state";

export const manualBillingPatchSchema = z.object({
  period: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .describe(
      "Month to edit, YYYY-MM. Required; historical and future months are editable.",
    ),
  managementFee: performanceAmountSchema.nullish(),
  adSpend: performanceAmountSchema.nullish(),
  managementPayment: z.enum(PAYMENT_STATES).nullish(),
  spendPayment: z.enum(PAYMENT_STATES).nullish(),
});
export type ManualBillingPatch = z.infer<typeof manualBillingPatchSchema>;
export const manualBillingResultSchema = manualBillingPatchSchema
  .required()
  .extend({
    managementFee: performanceAmountSchema.nullable(),
    adSpend: performanceAmountSchema.nullable(),
    managementPayment: z.enum(PAYMENT_STATES).nullable(),
    spendPayment: z.enum(PAYMENT_STATES).nullable(),
  });
