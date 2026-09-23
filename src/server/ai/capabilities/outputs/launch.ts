import { productAtlasSchema } from "@/lib/product-atlas";
import { campaignStatusEnum } from "@/server/db/ads-schema";
import { contentStatusEnum } from "@/server/db/content-schema";
import { seriesStatusEnum } from "@/server/db/content-schema";
import { z } from "zod";

/** Wire results for this capability. Dates are ISO strings after JSON normalization. */
const refSchema = z.strictObject({
  id: z.string(),
  kind: z.enum([
    "url",
    "content_post",
    "email_document",
    "production_packet",
    "platform_post",
  ]),
  label: z.string().optional(),
});

const deliverableItemSchema = z.strictObject({
  note: z.string().optional(),
  ownerId: z.string().optional(),
  ownerName: z.string().optional(),
  readyBy: z.string().optional(),
  ref: refSchema.optional(),
  status: z.enum(["not_started", "shipped", "drafting", "ready"]),
  surface: z.enum([
    "email",
    "changelog",
    "in_app",
    "help_center",
    "sales_enablement",
    "blog_or_social",
    "customer_prereads",
  ]),
});

export const listLaunchesActionOutputSchema = z.strictObject({
  appUrl: z.string(),
  launches: z.array(
    z.strictObject({
      deliverables: z.array(deliverableItemSchema),
      id: z.string(),
      maturity: z.enum(["private_preview", "beta", "ga"]),
      name: z.string(),
      ownerName: z.string().nullable(),
      productName: z.string().nullable(),
      ready: z.number(),
      releaseTheme: z.string().nullable(),
      slug: z.string(),
      status: z.enum(["draft", "approved", "shipped", "retro"]),
      targetDate: z.string().nullable(),
      tier: z.union([z.literal(3), z.literal(1), z.literal(2)]),
      total: z.number(),
    }),
  ),
});

export const readLaunchActionOutputSchema = z.strictObject({
  appUrl: z.string(),
  campaigns: z.array(
    z.strictObject({
      brandId: z.string(),
      id: z.string(),
      name: z.string(),
      status: z.enum(campaignStatusEnum.enumValues),
    }),
  ),
  deliverables: z.array(
    z.strictObject({
      note: z.string().optional(),
      ownerId: z.string().optional(),
      ownerName: z.string().optional(),
      readyBy: z.string().optional(),
      ref: refSchema.optional(),
      resolved: z
        .strictObject({
          href: z.string().nullable(),
          id: z.string(),
          kind: z.enum([
            "url",
            "content_post",
            "email_document",
            "production_packet",
            "platform_post",
          ]),
          label: z.string().nullable(),
          missing: z.boolean(),
        })
        .nullable(),
      status: z.enum(["not_started", "shipped", "drafting", "ready"]),
      surface: z.enum([
        "email",
        "changelog",
        "in_app",
        "help_center",
        "sales_enablement",
        "blog_or_social",
        "customer_prereads",
      ]),
    }),
  ),
  launch: z.strictObject({
    brief: z.strictObject({
      atlas: z
        .strictObject({
          storyIds: z.array(z.string()),
          viewIds: z.array(z.string()),
        })
        .optional(),
      audience: z
        .strictObject({
          excluded: z.string().optional(),
          motion: z.enum(["plg", "slg"]).optional(),
          who: z.string().optional(),
        })
        .optional(),
      changelogEntry: z.string().optional(),
      claims: z.array(z.string()),
      notSaying: z.string().optional(),
      objections: z.array(
        z.strictObject({
          answer: z.string().optional(),
          fieldedBy: z.string().optional(),
          question: z.string(),
        }),
      ),
      oneLine: z.string().optional(),
      success: z.array(
        z.strictObject({
          checkOn: z.string().optional(),
          layer: z.enum(["signal", "adoption", "impact"]),
          metric: z.string(),
          target: z.string().optional(),
        }),
      ),
    }),
    createdAt: z.iso.datetime(),
    createdById: z.string().nullable(),
    deletedAt: z.iso.datetime().nullable(),
    deliverables: z.array(deliverableItemSchema),
    id: z.string(),
    marketingOwner: z
      .strictObject({
        banExpires: z.iso.datetime().nullable(),
        banned: z.boolean().nullable(),
        banReason: z.string().nullable(),
        city: z.string().nullable(),
        country: z.string().nullable(),
        createdAt: z.iso.datetime(),
        dateFormat: z
          .enum(["mm_dd_yyyy", "dd_mm_yyyy", "yyyy_mm_dd"])
          .nullable(),
        displayUsername: z.string().nullable(),
        email: z.string().nullable(),
        emailVerified: z.boolean(),
        id: z.string(),
        image: z.string().nullable(),
        isAnonymous: z.boolean().nullable(),
        name: z.string().nullable(),
        onboardingCompletedAt: z.iso.datetime().nullable(),
        onboardingSource: z.array(z.string()).nullable(),
        preferredCurrency: z
          .enum(["usd", "eur", "nok", "gbp", "cad"])
          .nullable(),
        role: z.string().nullable(),
        timeZone: z.string().nullable(),
        unitSystem: z.enum(["metric", "imperial"]).nullable(),
        updatedAt: z.iso.datetime(),
        username: z.string().nullable(),
      })
      .nullable(),
    marketingOwnerId: z.string().nullable(),
    maturity: z.enum(["private_preview", "beta", "ga"]),
    name: z.string(),
    organizationId: z.string(),
    product: z.strictObject({
      atlas: productAtlasSchema,
      brandId: z.string(),
      createdAt: z.iso.datetime(),
      deletedAt: z.iso.datetime().nullable(),
      description: z.string().nullable(),
      id: z.string(),
      lifecycleStatus: z.enum(["active", "concept", "retired"]),
      managerUserId: z.string().nullable(),
      name: z.string(),
      organizationId: z.string(),
      slug: z.string(),
      updatedAt: z.iso.datetime(),
    }),
    productId: z.string(),
    releaseTheme: z.string().nullable(),
    shippedAt: z.iso.datetime().nullable(),
    slug: z.string(),
    sourceUrl: z.string().nullable(),
    status: z.enum(["draft", "approved", "shipped", "retro"]),
    targetDate: z.string().nullable(),
    tier: z.union([z.literal(3), z.literal(1), z.literal(2)]),
    updatedAt: z.iso.datetime(),
  }),
  next: z.array(z.string()),
  posts: z.array(
    z.strictObject({
      id: z.string(),
      status: z.enum(contentStatusEnum.enumValues),
      title: z.string().nullable(),
    }),
  ),
  series: z.array(
    z.strictObject({
      brandId: z.string(),
      id: z.string(),
      name: z.string(),
      status: z.enum(seriesStatusEnum.enumValues),
    }),
  ),
  features: z.array(
    z.strictObject({
      id: z.string(),
      job: z.string().nullable(),
      name: z.string(),
      shipping: z.boolean(),
    }),
  ),
  unknownStoryIds: z.array(z.string()),
});

export const createLaunchActionOutputSchema = z.strictObject({
  action: z.literal("saved"),
  appUrl: z.string(),
  launchId: z.string(),
  seededSurfaces: z.array(
    z.enum([
      "email",
      "changelog",
      "in_app",
      "help_center",
      "sales_enablement",
      "blog_or_social",
      "customer_prereads",
    ]),
  ),
});

export const setLaunchBriefActionOutputSchema = z.strictObject({
  action: z.literal("saved"),
  appUrl: z.string(),
  fields: z.array(z.string()),
  launchId: z.string(),
});

export const setLaunchFieldsActionOutputSchema = z.strictObject({
  action: z.literal("saved"),
  appUrl: z.string(),
  fields: z.array(z.string()),
  launchId: z.string(),
});

export const setLaunchFeaturesActionOutputSchema = z.strictObject({
  action: z.literal("saved"),
  appUrl: z.string(),
  launchId: z.string(),
  storyIds: z.array(z.string()),
});

export const setLaunchDeliverableActionOutputSchema = z.strictObject({
  action: z.literal("saved"),
  appUrl: z.string(),
  launchId: z.string(),
  surface: z.enum([
    "email",
    "changelog",
    "in_app",
    "help_center",
    "sales_enablement",
    "blog_or_social",
    "customer_prereads",
  ]),
});

export const attachLaunchDeliverableActionOutputSchema = z.strictObject({
  action: z.literal("saved"),
  appUrl: z.string(),
  launchId: z.string(),
  ref: refSchema,
  surface: z.enum([
    "email",
    "changelog",
    "in_app",
    "help_center",
    "sales_enablement",
    "blog_or_social",
    "customer_prereads",
  ]),
});
