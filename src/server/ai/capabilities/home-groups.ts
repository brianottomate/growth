import "server-only";
import { z } from "zod";
import { growthAction } from "./types";
import { bookingTargetInputSchema } from "@/lib/booking-target";
import {
  attachBookingTarget,
  changeGroupHomes,
  deleteHomeGroup,
  homeGroupContext,
  listBookingTargets,
  saveBookingTarget,
  saveHomeGroup,
  setPrimaryHomeGroup,
  setWanderOsEnabled,
} from "@/server/services/home-groups.service";
const brandInput = z.object({ brandId: z.string().min(1) });
export const homeGroupsAction = growthAction({
  description:
    "Read a brand's named home groups, ordered membership, all active homes and WanderOS connection readiness. Each group says where its homes came from (source: suggested by us, intake from the client's form, or manual) and whether it is the brand's primary group, the one ads, previews and newsletters draw from by default; home.featured mirrors the primary group. Groups work for brands without WanderOS; use returned Growth home IDs to edit membership.",
  inputSchema: brandInput,
  outputSchema: z.object({
    wanderOsEnabled: z.boolean(),
    connected: z.boolean(),
    groups: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        isPrimary: z.boolean(),
        source: z.enum(["suggested", "intake", "manual"]),
        description: z.string().nullable(),
        homeIds: z.array(z.string()),
      }),
    ),
    homes: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        source: z.enum(["wanderos", "wander", "manual"]),
        url: z.string(),
        externalId: z.string(),
        heroSourceUrl: z.string().nullable(),
      }),
    ),
  }),
  execute: (input, ctx) => homeGroupContext(input.brandId, ctx.orgId),
});
export const saveHomeGroupAction = growthAction({
  description:
    "Create a custom home group or edit a group's name and description. Reusable across ads and newsletters; creates no ads and publishes nothing. Supply groupId only to edit an existing group.",
  inputSchema: z.object({
    brandId: z.string().min(1),
    groupId: z.string().min(1).optional(),
    name: z.string().trim().min(1).max(120),
    description: z.string().max(2000).nullable().optional(),
  }),
  outputSchema: z.object({ groupId: z.string() }),
  execute: (input, ctx) => saveHomeGroup(input, ctx.orgId),
});
export const changeHomeGroupHomesAction = growthAction({
  description:
    "Add or remove homes from a group, or replace its membership with an ordered set. Each home must belong to the group's brand. Changing the primary group's membership updates the featured ticks. Does not change approved ads.",
  inputSchema: z.object({
    groupId: z.string().min(1),
    homeIds: z.array(z.string().min(1)).max(1000),
    operation: z.enum(["add", "remove", "replace"]),
  }),
  outputSchema: z.object({ groupId: z.string() }),
  execute: (input, ctx) => changeGroupHomes(input, ctx.orgId),
});
export const deleteHomeGroupAction = growthAction({
  description:
    "Delete a group without deleting homes. The primary group cannot be deleted (make another primary first); a group used by a booking target must be retained.",
  inputSchema: z.object({ groupId: z.string().min(1) }),
  outputSchema: z.object({ groupId: z.string() }),
  execute: (input, ctx) => deleteHomeGroup(input.groupId, ctx.orgId),
});
export const setPrimaryHomeGroupAction = growthAction({
  description:
    "Make a group the brand's primary home group: the default set ads, previews and newsletters draw from, mirrored by the featured ticks. Replaces the previous primary, which stays as an ordinary group. Changes no existing ads or campaigns.",
  inputSchema: z.object({ groupId: z.string().min(1) }),
  outputSchema: z.object({ groupId: z.string(), brandId: z.string() }),
  execute: (input, ctx) => setPrimaryHomeGroup(input.groupId, ctx.orgId),
});
export const bookingTargetsAction = growthAction({
  description:
    "Read a brand's booking targets: optional home/group, dates and guests, with resolved booking URLs or readiness issues. These require an enabled, connected WanderOS site. Search handles live availability; no inventory is reserved.",
  inputSchema: brandInput,
  outputSchema: z.object({
    targets: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        homeGroupId: z.string().nullable(),
        homeId: z.string().nullable(),
        checkIn: z.string().nullable(),
        checkOut: z.string().nullable(),
        guests: z.number().nullable(),
        url: z.string().nullable(),
        issue: z.string().nullable(),
      }),
    ),
  }),
  execute: (input, ctx) => listBookingTargets(input.brandId, ctx.orgId),
});
export const saveBookingTargetAction = growthAction({
  description:
    "Create or replace a reusable booking target for an enabled, connected WanderOS brand. Supply optional dates, guests and either a home or home group. Supply targetId to edit; edits never silently update approved ad URLs.",
  inputSchema: bookingTargetInputSchema.safeExtend({
    targetId: z.string().min(1).optional(),
  }),
  outputSchema: z.object({ targetId: z.string() }),
  execute: (input, ctx) => saveBookingTarget(input, ctx.orgId),
});
export const attachBookingTargetAction = growthAction({
  description:
    "Explicitly resolve and apply a booking target to a campaign's default landing URL, a draft ad, or a zero-based carousel cardIndex. Campaign changes preserve existing ad-specific URLs. Approved/pushed ads must be reopened before editing. No platform write or spend.",
  inputSchema: z
    .object({
      targetId: z.string().min(1),
      campaignId: z.string().min(1).optional(),
      adId: z.string().min(1).optional(),
      cardIndex: z.number().int().min(0).optional(),
    })
    .refine(
      (v) => Boolean(v.campaignId) !== Boolean(v.adId),
      "Choose one campaign or ad.",
    )
    .refine(
      (v) => v.cardIndex === undefined || Boolean(v.adId),
      "A card requires an ad.",
    ),
  outputSchema: z.object({ targetId: z.string(), url: z.string() }),
  execute: (input, ctx) => attachBookingTarget(input, ctx.orgId),
});
export const setWanderOsEnabledAction = growthAction({
  description:
    "Enable or disable a brand's WanderOS integration. Disabling preserves the connection ID, homes, groups and ads, but stops using the connected feed and booking targets. A website ID is still required to connect.",
  inputSchema: z.object({ brandId: z.string().min(1), enabled: z.boolean() }),
  outputSchema: z.object({ brandId: z.string(), enabled: z.boolean() }),
  execute: (input, ctx) =>
    setWanderOsEnabled(input.brandId, input.enabled, ctx.orgId),
});
