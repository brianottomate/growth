import { z } from "zod";

export const lifecycleAttributesSchema = z
  .record(
    z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/),
    z.union([
      z.string().max(2_000),
      z.number().finite(),
      z.boolean(),
      z.null(),
    ]),
  )
  .refine((value) => Object.keys(value).length <= 50, "At most 50 attributes");
export type LifecycleAttributes = z.infer<typeof lifecycleAttributesSchema>;

export const lifecycleConditionSchema = z
  .object({
    field: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/),
    operator: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "exists"]),
    value: z.union([z.string().max(2_000), z.number().finite(), z.boolean()]),
  })
  .refine(
    (rule) => rule.operator !== "exists" || typeof rule.value === "boolean",
    "An exists rule requires true or false",
  )
  .refine(
    (rule) =>
      !["gt", "gte", "lt", "lte"].includes(rule.operator) ||
      typeof rule.value === "number",
    "Numeric comparisons require a number",
  );
export type LifecycleCondition = z.infer<typeof lifecycleConditionSchema>;

export const lifecycleExecutionSettingsSchema = z.object({
  from: z
    .string()
    .trim()
    .min(3)
    .max(320)
    .regex(/^[^\r\n]+$/),
  replyTo: z.email().optional(),
  triggerEvent: z.string().trim().min(1).max(100),
  // All steps use absolute minutes from enrollment, matching the planning UI.
  conditions: z.record(z.string(), lifecycleConditionSchema).default({}),
  exitCondition: lifecycleConditionSchema.nullish(),
});
export type LifecycleExecutionSettings = z.infer<
  typeof lifecycleExecutionSettingsSchema
>;

export const lifecycleEnrollmentSchema = z.object({
  eventId: z.string().trim().min(1).max(200),
  eventName: z.string().trim().min(1).max(100),
  email: z.email().max(254).toLowerCase(),
  attributes: lifecycleAttributesSchema.default({}),
  consent: z.object({
    granted: z.literal(true),
    source: z.string().trim().min(1).max(200),
    recordedAt: z.iso.datetime({ offset: true }),
  }),
});
export type LifecycleEnrollment = z.infer<typeof lifecycleEnrollmentSchema>;

export const lifecycleProfileSchema = z.object({
  email: z.email().max(254).toLowerCase(),
  attributes: lifecycleAttributesSchema,
  observedAt: z.iso.datetime({ offset: true }),
  // A profile update can withdraw consent, never silently restore it.
  unsubscribe: z.boolean().default(false),
});

export interface LifecycleExecutionSnapshot {
  test?: { email: string; attributes: LifecycleAttributes };
  settings: LifecycleExecutionSettings;
  delivery: {
    provider: "postmark";
    serverId: number;
    messageStream: string;
  } | null;
  postalAddress: string | null;
  steps: {
    id: string;
    name: string;
    subject: string;
    body: string;
    renderedHtml: string;
    renderedText: string;
    platformPostId: string | null;
    delayMinutes: number;
    parentStepId: string | null;
    condition: LifecycleCondition | null;
  }[];
}
export interface LifecycleEmailPayload {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
  delivery: NonNullable<LifecycleExecutionSnapshot["delivery"]>;
}
