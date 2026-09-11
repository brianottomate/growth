import "server-only";

import { z } from "zod";
import { and, eq } from "drizzle-orm";

import {
  launchBriefSchema,
  launchDeliverableStatuses,
  launchMaturities,
  launchRefSchema,
  launchStatuses,
  launchSurfaces,
  launchTierGuidance,
} from "@/lib/launch";
import { db } from "@/server/db";
import { launchTable, productTable } from "@/server/db/schema";
import {
  createLaunch,
  listLaunches,
  readLaunch,
  setDeliverable,
} from "@/server/services/launch.service";

import { GrowthActionError, growthAction } from "./types";

/**
 * Launch capabilities, kept deliberately small: one verb each, over one row.
 *
 * There is no "plan the whole launch" action and there should not be one. The
 * agent sequences these itself, and the launch row is the working memory
 * between steps, so a half-finished launch is a resumable record rather than a
 * lost conversation.
 */

const tierSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

async function requireLaunch(orgId: string, launchId: string) {
  const launch = await db.query.launchTable.findFirst({
    where: and(
      eq(launchTable.id, launchId),
      eq(launchTable.organizationId, orgId),
    ),
    columns: { id: true, name: true, brief: true },
  });
  if (!launch) {
    throw new GrowthActionError("not_found", `No launch ${launchId}.`);
  }
  return launch;
}

export const listLaunchesAction = growthAction({
  description:
    "List this organization's launches with tier, target date, status, and how many deliverables are ready. Start here when the operator mentions a launch, a ship date, or a product moment.",
  inputSchema: z.object({}),
  execute: async (_input, ctx) => {
    const launches = await listLaunches(ctx.orgId);
    return { launches, appUrl: "/app/launches" };
  },
});

export const readLaunchAction = growthAction({
  description:
    "Read ONE launch in full: brief, per-surface deliverables with their owners and resolved drafts, linked series/campaigns/posts, and the concrete next moves it is still missing. Use this before any launch write so the next move is grounded.",
  inputSchema: z.object({ launchId: z.string() }),
  execute: async ({ launchId }, ctx) => {
    const result = await readLaunch(ctx.orgId, launchId);
    if (!result) {
      throw new GrowthActionError("not_found", `No launch ${launchId}.`);
    }
    return {
      launch: result.launch,
      deliverables: result.deliverables,
      series: result.series,
      campaigns: result.campaigns,
      posts: result.posts,
      next: result.missing,
      appUrl: `/app/launches/${launchId}`,
    };
  },
});

export const createLaunchAction = growthAction({
  description:
    "Create a launch for one product. Tier 1 is a full campaign (6 weeks lead), tier 2 is email + enablement + social (2 weeks), tier 3 is changelog + email (1 week); most things are tier 3. Seeds the deliverable rows that tier implies, each with no owner yet. Ask for the product and the customer-visible date before calling.",
  inputSchema: z.object({
    productId: z.string(),
    name: z.string().trim().min(1).max(200),
    tier: tierSchema,
    targetDate: z
      .string()
      .date()
      .optional()
      .describe("The date a customer can see it, not the code-complete date."),
    sourceUrl: z.string().url().optional(),
  }),
  execute: async (input, ctx) => {
    const product = await db.query.productTable.findFirst({
      where: and(
        eq(productTable.id, input.productId),
        eq(productTable.organizationId, ctx.orgId),
      ),
      columns: { id: true },
    });
    if (!product) {
      throw new GrowthActionError(
        "not_found",
        `No product ${input.productId} in this organization.`,
      );
    }
    const launch = await createLaunch({
      orgId: ctx.orgId,
      userId: ctx.userId,
      productId: input.productId,
      name: input.name,
      tier: input.tier,
      targetDate: input.targetDate,
      sourceUrl: input.sourceUrl,
    });
    return {
      action: "saved" as const,
      launchId: launch.id,
      seededSurfaces: launchTierGuidance[input.tier].surfaces,
      appUrl: `/app/launches/${launch.id}`,
    };
  },
});

export const setLaunchBriefAction = growthAction({
  description:
    "Merge fields into a launch's brief: the one line, up to three provable claims, what we are deliberately not saying, the changelog entry, audience, objections, success layers, and the atlas story ids this ships. Partial by design — write the fields you actually have and leave the rest alone.",
  inputSchema: z.object({
    launchId: z.string(),
    brief: launchBriefSchema.partial(),
  }),
  execute: async ({ launchId, brief }, ctx) => {
    const existing = await requireLaunch(ctx.orgId, launchId);
    const merged = launchBriefSchema.parse({ ...existing.brief, ...brief });
    await db
      .update(launchTable)
      .set({ brief: merged })
      .where(eq(launchTable.id, launchId));
    return {
      action: "saved" as const,
      launchId,
      fields: Object.keys(brief),
      appUrl: `/app/launches/${launchId}`,
    };
  },
});

export const setLaunchFieldsAction = growthAction({
  description:
    "Set a launch's own fields: name, tier, target date, maturity, status, marketing owner, or release theme. Setting status to shipped stamps the ship time.",
  inputSchema: z.object({
    launchId: z.string(),
    name: z.string().trim().min(1).max(200).optional(),
    tier: tierSchema.optional(),
    targetDate: z.string().date().optional(),
    maturity: z.enum(launchMaturities).optional(),
    status: z.enum(launchStatuses).optional(),
    marketingOwnerId: z.string().optional(),
    releaseTheme: z.string().trim().max(240).optional(),
  }),
  execute: async ({ launchId, ...fields }, ctx) => {
    await requireLaunch(ctx.orgId, launchId);
    const patch: Partial<typeof launchTable.$inferInsert> =
      Object.fromEntries(
        Object.entries(fields).filter(([, v]) => v !== undefined),
      );
    if (Object.keys(patch).length === 0) {
      throw new GrowthActionError("invalid_input", "Nothing to set.");
    }
    if (patch.status === "shipped") patch.shippedAt = new Date();
    await db
      .update(launchTable)
      .set(patch)
      .where(eq(launchTable.id, launchId));
    return {
      action: "saved" as const,
      launchId,
      fields: Object.keys(patch),
      appUrl: `/app/launches/${launchId}`,
    };
  },
});

export const setLaunchFeaturesAction = growthAction({
  description:
    "Set which of the product's features (Product Atlas stories) this launch ships. Replaces the list, so pass every feature that belongs, and read the launch first to see what the product actually has. An empty list means the product itself is launching rather than features of it.",
  inputSchema: z.object({
    launchId: z.string(),
    storyIds: z.array(z.string().trim().min(1)).max(50),
  }),
  execute: async ({ launchId, storyIds }, ctx) => {
    const launch = await db.query.launchTable.findFirst({
      where: and(
        eq(launchTable.id, launchId),
        eq(launchTable.organizationId, ctx.orgId),
      ),
      columns: { id: true, brief: true },
      with: { product: { columns: { atlas: true } } },
    });
    if (!launch) {
      throw new GrowthActionError("not_found", `No launch ${launchId}.`);
    }
    const known = new Set(launch.product.atlas.stories.map((s) => s.id));
    const unknown = storyIds.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      throw new GrowthActionError(
        "invalid_input",
        `Not features of this product: ${unknown.join(", ")}. Read the launch to see its product's features.`,
      );
    }
    const brief = launchBriefSchema.parse({
      ...launch.brief,
      atlas: {
        ...(launch.brief.atlas ?? { storyIds: [], viewIds: [] }),
        storyIds,
      },
    });
    await db
      .update(launchTable)
      .set({ brief })
      .where(eq(launchTable.id, launchId));
    return {
      action: "saved" as const,
      launchId,
      storyIds,
      appUrl: `/app/launches/${launchId}`,
    };
  },
});

export const setLaunchDeliverableAction = growthAction({
  description:
    "Set ONE surface's row on a launch: owner, ready-by date, status, or a note. Creates the row if that surface has none. Keep ownerName as the person's real name even when they have no Growth account; only set ownerId when the member is certain, never guessed.",
  inputSchema: z.object({
    launchId: z.string(),
    surface: z.enum(launchSurfaces),
    ownerName: z.string().trim().max(160).optional(),
    ownerId: z.string().optional(),
    readyBy: z.string().date().optional(),
    status: z.enum(launchDeliverableStatuses).optional(),
    note: z.string().trim().max(1_000).optional(),
  }),
  execute: async ({ launchId, surface, ...patch }, ctx) => {
    await requireLaunch(ctx.orgId, launchId);
    await setDeliverable(ctx.orgId, launchId, surface, patch);
    return {
      action: "saved" as const,
      launchId,
      surface,
      appUrl: `/app/launches/${launchId}`,
    };
  },
});

export const attachLaunchDeliverableAction = growthAction({
  description:
    "Point one launch surface at the Growth object that fulfils it — a content_post, an email_document, a production_packet, a platform_post, or a plain URL. This only records the link; draft the thing itself with the content, email, or blog capabilities first, then attach it here.",
  inputSchema: z.object({
    launchId: z.string(),
    surface: z.enum(launchSurfaces),
    ref: launchRefSchema,
    status: z.enum(launchDeliverableStatuses).optional(),
  }),
  execute: async ({ launchId, surface, ref, status }, ctx) => {
    await requireLaunch(ctx.orgId, launchId);
    await setDeliverable(ctx.orgId, launchId, surface, {
      ref,
      ...(status ? { status } : {}),
    });
    return {
      action: "saved" as const,
      launchId,
      surface,
      ref,
      appUrl: `/app/launches/${launchId}`,
    };
  },
});

export const LAUNCH_TOOLS = {
  listLaunches: listLaunchesAction,
  readLaunch: readLaunchAction,
  createLaunch: createLaunchAction,
  setBrief: setLaunchBriefAction,
  setFields: setLaunchFieldsAction,
  setFeatures: setLaunchFeaturesAction,
  setDeliverable: setLaunchDeliverableAction,
  attach: attachLaunchDeliverableAction,
} as const;
