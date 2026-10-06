import "server-only";
import { z } from "zod";
import {
  channelPlatformEnum,
  campaignStatusEnum,
  contentStatusEnum,
  seriesStatusEnum,
} from "@/server/db/schema";
import {
  initiativeStatusSchema,
  initiativeTargetSchema,
} from "@/lib/initiative";
import {
  changeInitiativeMember,
  getInitiative,
  initiativeWorkspace,
  listInitiatives,
  saveInitiative,
} from "@/server/services/initiative.service";
import { growthAction } from "./types";
const brand = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string().nullable(),
});
const owner = z.object({ id: z.string(), name: z.string().nullable() });
const series = z.object({
  id: z.string(),
  name: z.string(),
  brandId: z.string(),
  status: z.enum(seriesStatusEnum.enumValues),
});
const campaign = series.extend({
  status: z.enum(campaignStatusEnum.enumValues),
});
const post = z.object({
  id: z.string(),
  title: z.string().nullable(),
  brandId: z.string(),
  seriesId: z.string().nullable(),
  status: z.enum(contentStatusEnum.enumValues),
});
const initiative = z.object({
  id: z.string(),
  organizationId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  status: z.string(),
  leadBrandId: z.string().nullable(),
  ownerId: z.string().nullable(),
  startAt: z.string().nullable(),
  endAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
const previewMedia = z.object({
  url: z.string(),
  type: z.enum(["image", "video", "carousel"]),
  thumbnail: z.string().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
});
const previewBase = {
  id: z.string(),
  description: z.string().nullable(),
  media: z.array(previewMedia),
};
const dates = { startAt: z.string().nullable(), endAt: z.string().nullable() };
const platform = z.object({
  platform: z.enum(channelPlatformEnum.enumValues),
  status: z.string(),
});
const detail = z.object({
  previews: z.object({
    editorial: z.array(
      z.object({
        ...previewBase,
        contentPostId: z.string(),
        externalId: z.string().nullable(),
        documentId: z.string().nullable(),
        hasArticleBody: z.boolean(),
        seriesId: z.string().nullable(),
        kind: z.enum(["email", "blog"]),
        title: z.string(),
        status: z.string(),
        scheduledAt: z.string().nullable(),
        publishedAt: z.string().nullable(),
      }),
    ),
    posts: z.array(
      z.object({
        ...previewBase,
        plannedAt: z.string().nullable(),
        channels: z.array(platform.extend({ format: z.string().nullable() })),
      }),
    ),
    series: z.array(
      z.object({ ...previewBase, ...dates, postCount: z.number() }),
    ),
    campaigns: z.array(
      z.object({
        ...previewBase,
        ...dates,
        goal: z.string().nullable(),
        adCount: z.number(),
        ads: z.array(
          z.object({
            ...previewBase,
            name: z.string(),
            textOnly: z.boolean(),
            status: z.enum(["drawn", "kept", "approved", "ready"]),
            executions: z.array(platform),
          }),
        ),
        creativeLines: z.array(z.string()),
        audienceCount: z.number(),
        audiences: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            description: z.string().nullable(),
          }),
        ),
        platforms: z.array(
          platform.extend({ id: z.string(), pushed: z.boolean() }),
        ),
      }),
    ),
  }),
  initiative,
  brands: z.array(brand),
  owners: z.array(owner),
  series: z.array(series),
  campaigns: z.array(campaign),
  contentPosts: z.array(post.extend({ direct: z.boolean() })),
  members: z.array(
    z.object({
      id: z.string(),
      initiativeId: z.string(),
      contentPostId: z.string().nullable(),
      seriesId: z.string().nullable(),
      campaignId: z.string().nullable(),
      createdAt: z.string(),
    }),
  ),
});
export const listInitiativesAction = growthAction({
  description:
    "List workspace initiatives. Initiatives group organic and paid work without owning it.",
  inputSchema: z.object({}),
  outputSchema: z.object({ initiatives: z.array(initiative) }),
  execute: (_, ctx) => listInitiatives(ctx.orgId),
});
export const initiativeOptionsAction = growthAction({
  description:
    "List workspace brands, owners, and eligible membership targets, including standalone content.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    brands: z.array(brand),
    owners: z.array(owner),
    series: z.array(series),
    posts: z.array(post),
    campaigns: z.array(campaign),
  }),
  execute: (_, ctx) => initiativeWorkspace(ctx.orgId),
});
export const getInitiativeAction = growthAction({
  description:
    "Read an initiative and its paid campaigns, series and deduplicated effective content. Series posts are included automatically.",
  inputSchema: z.object({ id: z.string().min(1) }),
  outputSchema: detail,
  execute: (input, ctx) => getInitiative(input.id, ctx.orgId),
});
export const saveInitiativeAction = growthAction({
  description:
    "Create or edit an internal initiative. Optional lead brand and owner must belong to the workspace. Does not publish or launch anything.",
  inputSchema: z
    .object({
      id: z.string().min(1).optional(),
      name: z.string().trim().min(1).max(200),
      description: z.string().max(10000).nullable(),
      status: initiativeStatusSchema,
      leadBrandId: z.string().nullable(),
      ownerId: z.string().nullable(),
      startAt: z.iso.datetime().nullable(),
      endAt: z.iso.datetime().nullable(),
    })
    .refine(
      (v) => !v.startAt || !v.endAt || v.endAt >= v.startAt,
      "End date must follow start date.",
    ),
  outputSchema: detail,
  execute: (input, ctx) => saveInitiative(input, ctx.orgId),
});
const memberInput = initiativeTargetSchema.safeExtend({
  id: z.string().min(1),
});
export const linkInitiativeAction = growthAction({
  description:
    "Attach exactly one content post, series, or paid campaign to an initiative. Cross-brand links within the workspace are allowed. Duplicate links are harmless.",
  inputSchema: memberInput,
  outputSchema: detail,
  execute: ({ id, ...target }, ctx) =>
    changeInitiativeMember(id, target, ctx.orgId, true),
});
export const unlinkInitiativeAction = growthAction({
  description:
    "Remove one direct initiative membership. Work is preserved; series-inherited content remains while its series is linked.",
  inputSchema: memberInput,
  outputSchema: detail,
  execute: ({ id, ...target }, ctx) =>
    changeInitiativeMember(id, target, ctx.orgId, false),
});
