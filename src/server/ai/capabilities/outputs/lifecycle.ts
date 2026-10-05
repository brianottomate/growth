import { cleanupStatusEnum } from "@/server/db/content-schema";
import { lifecycleRunStateEnum } from "@/server/db/lifecycle-schema";
import { touchpointChannelEnum } from "@/server/db/lifecycle-schema";
import { lifecycleKindEnum } from "@/server/db/lifecycle-schema";
import { lifecycleProgramStatusEnum } from "@/server/db/lifecycle-schema";
import { z } from "zod";
import { jsonValueSchema } from "../../kernel/output";

/** Wire results for this capability. Dates are ISO strings after JSON normalization. */
const campaignItemSchema = z.strictObject({
  brandId: z.string(),
  cleanupStatus: z.enum(cleanupStatusEnum.enumValues),
  id: z.string(),
  name: z.string(),
  programId: z.string().nullable(),
  provider: z
    .enum([
      "zernio",
      "customerio",
      "instantly",
      "hubspot",
      "native",
      "manual",
      "email_forward",
      "postmark",
      "resend",
      "outreach",
    ])
    .nullable(),
  runState: z.enum(lifecycleRunStateEnum.enumValues),
});

const campaignItemSchema2 = z.strictObject({
  id: z.string(),
  name: z.string(),
  provider: z
    .enum([
      "zernio",
      "customerio",
      "instantly",
      "hubspot",
      "native",
      "manual",
      "email_forward",
      "postmark",
      "resend",
      "outreach",
    ])
    .nullable(),
  runState: z.enum(lifecycleRunStateEnum.enumValues),
  triggerEvent: z.string().nullable(),
});

const campaignSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  runState: z.enum(lifecycleRunStateEnum.enumValues),
});

const stepItemSchema = z.strictObject({
  body: z.string().nullable(),
  branchLabel: z.string().nullable(),
  campaign: campaignSchema.nullable(),
  campaignId: z.string().nullable(),
  channel: z.enum(touchpointChannelEnum.enumValues),
  createdAt: z.iso.datetime(),
  delayLabel: z.string().nullable(),
  delayMinutes: z.number().nullable(),
  id: z.string(),
  name: z.string(),
  parentStepId: z.string().nullable(),
  position: z.number(),
  programId: z.string(),
  status: z.enum(["active", "planned", "missing"]),
  subject: z.string().nullable(),
  system: z
    .enum([
      "other",
      "customerio",
      "instantly",
      "hubspot",
      "postmark",
      "resend",
      "outreach",
      "human",
      "system",
      "amplitude",
    ])
    .nullable(),
  updatedAt: z.iso.datetime(),
  url: z.string().nullable(),
});

const programItemSchema = z.strictObject({
  brandId: z.string(),
  campaigns: z.array(campaignItemSchema2),
  coverage: z.enum(["partial", "covered", "gap"]),
  createdAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
  description: z.string().nullable(),
  id: z.string(),
  intendedChannels: z
    .array(z.enum(touchpointChannelEnum.enumValues))
    .nullable(),
  intendedTrigger: z.string().nullable(),
  kind: z.enum(lifecycleKindEnum.enumValues),
  metadata: jsonValueSchema,
  name: z.string(),
  priority: z.enum(["must_have", "should_have", "nice_to_have"]),
  status: z.enum(lifecycleProgramStatusEnum.enumValues),
  steps: z.array(stepItemSchema),
  targetTouchpoints: z.number().nullable(),
  updatedAt: z.iso.datetime(),
  workspace: z.enum(["os", "marketplace", "shared"]),
});

const metricsSchema = z.strictObject({
  bounced: z.number().optional(),
  clicked: z.number().optional(),
  converted: z.number().optional(),
  delivered: z.number().optional(),
  matched: z.number().optional(),
  opened: z.number().optional(),
  sent: z.number().optional(),
});

const programSchema = z.strictObject({
  brandId: z.string(),
  createdAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
  description: z.string().nullable(),
  id: z.string(),
  intendedChannels: z
    .array(z.enum(touchpointChannelEnum.enumValues))
    .nullable(),
  intendedTrigger: z.string().nullable(),
  kind: z.enum(lifecycleKindEnum.enumValues),
  metadata: jsonValueSchema,
  name: z.string(),
  priority: z.enum(["must_have", "should_have", "nice_to_have"]),
  status: z.enum(lifecycleProgramStatusEnum.enumValues),
  targetTouchpoints: z.number().nullable(),
  updatedAt: z.iso.datetime(),
  workspace: z.enum(["os", "marketplace", "shared"]),
});

export const programResultSchema = z.strictObject({
  program: programSchema,
  url: z.string(),
});

const stepSchema = z.strictObject({
  body: z.string().nullable(),
  branchLabel: z.string().nullable(),
  campaignId: z.string().nullable(),
  channel: z.enum(touchpointChannelEnum.enumValues),
  createdAt: z.iso.datetime(),
  delayLabel: z.string().nullable(),
  delayMinutes: z.number().nullable(),
  id: z.string(),
  name: z.string(),
  parentStepId: z.string().nullable(),
  position: z.number(),
  programId: z.string(),
  status: z.enum(["active", "planned", "missing"]),
  subject: z.string().nullable(),
  system: z
    .enum([
      "other",
      "customerio",
      "instantly",
      "hubspot",
      "postmark",
      "resend",
      "outreach",
      "human",
      "system",
      "amplitude",
    ])
    .nullable(),
  updatedAt: z.iso.datetime(),
  url: z.string().nullable(),
});

export const stepResultSchema = z.strictObject({
  step: stepSchema,
  url: z.string(),
});

const campaignRecordSchema = z.strictObject({
  brandId: z.string(),
  channelId: z.string().nullable(),
  cleanupStatus: z.enum(cleanupStatusEnum.enumValues),
  createdAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
  description: z.string().nullable(),
  externalId: z.string().nullable(),
  externalKind: z.string().nullable(),
  externalUrl: z.string().nullable(),
  id: z.string(),
  kind: z.enum(lifecycleKindEnum.enumValues),
  lastSentAt: z.iso.datetime().nullable(),
  metadata: jsonValueSchema,
  metrics: metricsSchema.nullable(),
  name: z.string(),
  performanceCycleId: z.string().nullable(),
  programId: z.string().nullable(),
  provider: z
    .enum([
      "zernio",
      "customerio",
      "instantly",
      "hubspot",
      "native",
      "manual",
      "email_forward",
      "postmark",
      "resend",
      "outreach",
    ])
    .nullable(),
  runState: z.enum(lifecycleRunStateEnum.enumValues),
  startedAt: z.iso.datetime().nullable(),
  triggerEvent: z.string().nullable(),
  updatedAt: z.iso.datetime(),
});

export const campaignResultSchema = z.strictObject({
  campaign: campaignRecordSchema,
  url: z.string(),
});

export const overviewResultSchema = z.strictObject({
  campaigns: z.array(campaignItemSchema),
  campaignSummary: z.array(
    z.strictObject({
      cleanupStatus: z.string().optional(),
      count: z.number(),
      runState: z.string().optional(),
    }),
  ),
  programs: z.array(programItemSchema),
});

export const inspectProgramResultSchema = z.strictObject({
  brand: z.strictObject({ id: z.string(), name: z.string() }),
  brandId: z.string(),
  campaigns: z.array(
    z.strictObject({
      brandId: z.string(),
      channelId: z.string().nullable(),
      cleanupStatus: z.enum(cleanupStatusEnum.enumValues),
      createdAt: z.iso.datetime(),
      deletedAt: z.iso.datetime().nullable(),
      description: z.string().nullable(),
      externalId: z.string().nullable(),
      externalKind: z.string().nullable(),
      externalUrl: z.string().nullable(),
      id: z.string(),
      kind: z.enum(lifecycleKindEnum.enumValues),
      lastSentAt: z.iso.datetime().nullable(),
      metadata: jsonValueSchema,
      metrics: metricsSchema.nullable(),
      name: z.string(),
      performanceCycleId: z.string().nullable(),
      programId: z.string().nullable(),
      provider: z
        .enum([
          "zernio",
          "customerio",
          "instantly",
          "hubspot",
          "native",
          "manual",
          "email_forward",
          "postmark",
          "resend",
          "outreach",
        ])
        .nullable(),
      runState: z.enum(lifecycleRunStateEnum.enumValues),
      startedAt: z.iso.datetime().nullable(),
      touchpoints: z.array(
        z.strictObject({
          campaignId: z.string(),
          channel: z.enum(touchpointChannelEnum.enumValues),
          createdAt: z.iso.datetime(),
          delayLabel: z.string().nullable(),
          externalId: z.string().nullable(),
          id: z.string(),
          metrics: metricsSchema.nullable(),
          name: z.string().nullable(),
          position: z.number(),
          subject: z.string().nullable(),
          updatedAt: z.iso.datetime(),
        }),
      ),
      triggerEvent: z.string().nullable(),
      updatedAt: z.iso.datetime(),
    }),
  ),
  coverage: z.enum(["partial", "covered", "gap"]),
  createdAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
  description: z.string().nullable(),
  id: z.string(),
  intendedChannels: z
    .array(z.enum(touchpointChannelEnum.enumValues))
    .nullable(),
  intendedTrigger: z.string().nullable(),
  kind: z.enum(lifecycleKindEnum.enumValues),
  metadata: jsonValueSchema,
  name: z.string(),
  priority: z.enum(["must_have", "should_have", "nice_to_have"]),
  status: z.enum(lifecycleProgramStatusEnum.enumValues),
  steps: z.array(
    z.strictObject({
      body: z.string().nullable(),
      branchLabel: z.string().nullable(),
      campaign: z
        .strictObject({
          id: z.string(),
          name: z.string(),
          provider: z
            .enum([
              "zernio",
              "customerio",
              "instantly",
              "hubspot",
              "native",
              "manual",
              "email_forward",
              "postmark",
              "resend",
              "outreach",
            ])
            .nullable(),
          runState: z.enum(lifecycleRunStateEnum.enumValues),
        })
        .nullable(),
      campaignId: z.string().nullable(),
      channel: z.enum(touchpointChannelEnum.enumValues),
      createdAt: z.iso.datetime(),
      delayLabel: z.string().nullable(),
      delayMinutes: z.number().nullable(),
      id: z.string(),
      name: z.string(),
      parentStepId: z.string().nullable(),
      position: z.number(),
      programId: z.string(),
      status: z.enum(["active", "planned", "missing"]),
      subject: z.string().nullable(),
      system: z
        .enum([
          "other",
          "customerio",
          "instantly",
          "hubspot",
          "postmark",
          "resend",
          "outreach",
          "human",
          "system",
          "amplitude",
        ])
        .nullable(),
      updatedAt: z.iso.datetime(),
      url: z.string().nullable(),
    }),
  ),
  targetTouchpoints: z.number().nullable(),
  updatedAt: z.iso.datetime(),
  workspace: z.enum(["os", "marketplace", "shared"]),
});

export const searchCampaignsResultSchema = z.array(
  z.strictObject({
    brandId: z.string(),
    channelId: z.string().nullable(),
    cleanupStatus: z.enum(cleanupStatusEnum.enumValues),
    createdAt: z.iso.datetime(),
    deletedAt: z.iso.datetime().nullable(),
    description: z.string().nullable(),
    externalId: z.string().nullable(),
    externalKind: z.string().nullable(),
    externalUrl: z.string().nullable(),
    id: z.string(),
    kind: z.enum(lifecycleKindEnum.enumValues),
    lastSentAt: z.iso.datetime().nullable(),
    metadata: jsonValueSchema,
    metrics: metricsSchema.nullable(),
    name: z.string(),
    performanceCycleId: z.string().nullable(),
    program: z.strictObject({ id: z.string(), name: z.string() }).nullable(),
    programId: z.string().nullable(),
    provider: z
      .enum([
        "zernio",
        "customerio",
        "instantly",
        "hubspot",
        "native",
        "manual",
        "email_forward",
        "postmark",
        "resend",
        "outreach",
      ])
      .nullable(),
    runState: z.enum(lifecycleRunStateEnum.enumValues),
    startedAt: z.iso.datetime().nullable(),
    touchpoints: z.array(
      z.strictObject({
        channel: z.enum(touchpointChannelEnum.enumValues),
        id: z.string(),
        name: z.string().nullable(),
        subject: z.string().nullable(),
      }),
    ),
    triggerEvent: z.string().nullable(),
    updatedAt: z.iso.datetime(),
  }),
);

export const findGapsResultSchema = z.strictObject({
  cleanupCandidates: z.array(campaignItemSchema),
  programs: z.array(programItemSchema),
  unlinkedCampaigns: z.array(campaignItemSchema),
});

/** Native service result; the existing wire contract validates its JSON projection. */
export const overviewNativeResultSchema = overviewResultSchema.extend({
  programs: z.array(
    overviewResultSchema.shape.programs.element.extend({
      createdAt: z.date(),
      deletedAt: z.date().nullable(),
      metadata: z.unknown(),
      steps: z.array(
        overviewResultSchema.shape.programs.element.shape.steps.element.extend({
          createdAt: z.date(),
          updatedAt: z.date(),
        }),
      ),
      updatedAt: z.date(),
    }),
  ),
});

/** Native service result; the existing wire contract validates its JSON projection. */
export const inspectProgramNativeResultSchema =
  inspectProgramResultSchema.extend({
    campaigns: z.array(
      inspectProgramResultSchema.shape.campaigns.element.extend({
        createdAt: z.date(),
        deletedAt: z.date().nullable(),
        lastSentAt: z.date().nullable(),
        metadata: z.unknown(),
        startedAt: z.date().nullable(),
        touchpoints: z.array(
          inspectProgramResultSchema.shape.campaigns.element.shape.touchpoints.element.extend(
            { createdAt: z.date(), updatedAt: z.date() },
          ),
        ),
        updatedAt: z.date(),
      }),
    ),
    createdAt: z.date(),
    deletedAt: z.date().nullable(),
    metadata: z.unknown(),
    steps: z.array(
      inspectProgramResultSchema.shape.steps.element.extend({
        createdAt: z.date(),
        updatedAt: z.date(),
      }),
    ),
    updatedAt: z.date(),
  });

/** Native service result; the existing wire contract validates its JSON projection. */
export const searchCampaignsNativeResultSchema = z.array(
  searchCampaignsResultSchema.element.extend({
    createdAt: z.date(),
    deletedAt: z.date().nullable(),
    lastSentAt: z.date().nullable(),
    metadata: z.unknown(),
    startedAt: z.date().nullable(),
    updatedAt: z.date(),
  }),
);

/** Native service result; the existing wire contract validates its JSON projection. */
export const findGapsNativeResultSchema = findGapsResultSchema.extend({
  programs: z.array(
    findGapsResultSchema.shape.programs.element.extend({
      createdAt: z.date(),
      deletedAt: z.date().nullable(),
      metadata: z.unknown(),
      steps: z.array(
        findGapsResultSchema.shape.programs.element.shape.steps.element.extend({
          createdAt: z.date(),
          updatedAt: z.date(),
        }),
      ),
      updatedAt: z.date(),
    }),
  ),
});

/** Native service result; the existing wire contract validates its JSON projection. */
export const programNativeResultSchema = programResultSchema.extend({
  program: programResultSchema.shape.program.extend({
    createdAt: z.date(),
    deletedAt: z.date().nullable(),
    metadata: z.unknown(),
    updatedAt: z.date(),
  }),
});

/** Native service result; the existing wire contract validates its JSON projection. */
export const stepNativeResultSchema = stepResultSchema.extend({
  step: stepResultSchema.shape.step.extend({
    createdAt: z.date(),
    updatedAt: z.date(),
  }),
});

/** Native service result; the existing wire contract validates its JSON projection. */
export const campaignNativeResultSchema = campaignResultSchema.extend({
  campaign: campaignResultSchema.shape.campaign.extend({
    createdAt: z.date(),
    deletedAt: z.date().nullable(),
    lastSentAt: z.date().nullable(),
    metadata: z.unknown(),
    startedAt: z.date().nullable(),
    updatedAt: z.date(),
  }),
});
