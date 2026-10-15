import { steerSchema } from "@/lib/generation-steer";
import "server-only";

import { after } from "next/server";
import { z } from "zod";

import {
  CATALOG_TEMPLATES,
  CATALOG_WRITE_PASSES,
  catalogAdCopySchema,
} from "@/lib/catalog-studio";
import {
  newCatalogCopy,
  newCatalogPhoto,
  catalogWriteStatus,
  runCatalogWrite,
  startCatalogWrite,
} from "@/server/services/catalog-quick-fix.service";
import {
  catalogBrand,
  catalogListingId,
  catalogListingIds,
  catalogState,
  deleteCatalogExport,
  renderCatalogExport,
  setCatalogApproval,
  setCatalogAdCopy,
  setCatalogDefaultTemplate,
  setCatalogIncluded,
  startCatalogExport,
  writeCatalogAdCopy,
} from "@/server/services/catalog-studio.service";
import { ingestBrandHomes } from "@/server/services/homes.service";

import {
  catalogStateActionOutputSchema,
  catalogWriteStatusActionOutputSchema,
  deleteCatalogExportActionOutputSchema,
  exportCatalogActionOutputSchema,
  newCatalogCopyActionOutputSchema,
  newCatalogPhotoActionOutputSchema,
  setCatalogApprovalActionOutputSchema,
  setCatalogAdCopyActionOutputSchema,
  setCatalogDefaultTemplateActionOutputSchema,
  setCatalogIncludedActionOutputSchema,
  writeCatalogCardsActionOutputSchema,
  writeCatalogAdCopyActionOutputSchema,
} from "./outputs/catalog";
import { growthAction } from "./types";
import { requireOwnedBrand } from "./brand-access";

import { wanderOsImportRunSchema } from "@/lib/wanderos-import";
import {
  startWanderOsImport,
  runWanderOsImport,
  wanderOsImportStatus,
} from "@/server/services/wanderos-import.service";

const brandInput = z.object({ brandId: z.string().min(1) });
const homeInput = brandInput.extend({
  homeId: z.string().min(1).describe("The WanderOS listing id."),
  force: z
    .boolean()
    .optional()
    .describe(
      "Reserved for local export tooling. Approved card edits require reopening.",
    ),
});

export const importWanderOsAction = growthAction({
  inputSchema: brandInput,
  outputSchema: z.object({
    started: z.boolean(),
    run: wanderOsImportRunSchema,
  }),
  description:
    "Onboard a WanderOS brand after identity, story and creative mark are saved: import homes, select Featured homes, create destinations and missing personas, draft starter ads in Ad Studio, draft one standalone email broadcast, and prepare the catalog. Existing selections, personas and drafts are preserved. Starts immediately; call adsRead.wanderOsImportStatus with waitSeconds:20 to follow progress. Retry resumes unfinished steps. Nothing is approved, scheduled, sent, pushed or exported.",
  examples: [{ brandId: "brd_01" }],
  execute: async (input, ctx) => {
    await requireOwnedBrand(input.brandId, ctx);
    const actor = { ...input, userId: ctx.userId };
    const result = await startWanderOsImport(actor);
    if (result.started) {
      // Start before the chat stream ends so a status tool can wait in this turn.
      const work = runWanderOsImport(result.run.id, actor).catch(
        (error: unknown) => {
          console.error(
            "WanderOS worker could not start; queued recovery will retry",
            {
              runId: result.run.id,
              error:
                error instanceof Error
                  ? error.message
                  : "Unknown startup failure",
            },
          );
        },
      );
      after(() => work);
    }
    return result;
  },
});
export const wanderOsImportStatusAction = growthAction({
  inputSchema: brandInput.extend({
    waitSeconds: z.number().int().min(0).max(20).optional(),
  }),
  outputSchema: z.object({
    run: wanderOsImportRunSchema.nullable(),
    missingFoundations: z.array(z.string()),
    setupHref: z.string(),
    needsPreparation: z.boolean(),
  }),
  description:
    "Read WanderOS onboarding progress, including personas, Ad Studio drafts and the first broadcast. If needsPreparation is true, call importWanderOs to add new preparation steps to an older completed import without repeating its completed work. Set waitSeconds:20 to wait for a terminal result; repeat while queued/running. Continue when succeeded. Failed steps retain saved work and report the reason.",
  examples: [{ brandId: "brd_01" }],
  execute: async (input, ctx) => {
    await requireOwnedBrand(input.brandId, ctx);
    const until = Date.now() + (input.waitSeconds ?? 0) * 1000;
    let result = await wanderOsImportStatus({ ...input, userId: ctx.userId });
    while (
      result.run &&
      ["queued", "running"].includes(result.run.status) &&
      Date.now() < until
    ) {
      await new Promise<void>((resolve) =>
        setTimeout(resolve, Math.min(2000, until - Date.now())),
      );
      result = await wanderOsImportStatus({ ...input, userId: ctx.userId });
    }
    return result;
  },
});

export const catalogStateAction = growthAction({
  outputSchema: catalogStateActionOutputSchema,
  description:
    "Read a Performance client's whole catalog draft: every home with its photos, every card as it will export (headline, facts line, template, photo, inclusion, approval), the brand's default card template, the cards still on their starter headline, and the exports with their progress. Large; for writing one card use catalogHomeFacts.",
  inputSchema: brandInput,
  examples: [{ brandId: "brd_01" }],
  execute: ({ brandId }, ctx) => catalogState(ctx.userId, brandId),
});

export const catalogWriteStatusAction = growthAction({
  outputSchema: catalogWriteStatusActionOutputSchema,
  description:
    "Progress of the brand's latest writeCatalogCards run: which pass, status, cards done of total, how many failed and how many it ran out of time for. run is null when no pass has run.",
  inputSchema: brandInput,
  examples: [{ brandId: "brd_01" }],
  execute: ({ brandId }, ctx) =>
    catalogWriteStatus({ userId: ctx.userId, brandId }),
});

export const refreshCatalogHomesAction = growthAction({
  outputSchema: catalogStateActionOutputSchema,
  description:
    "Read a Performance client's homes again from their website: new listings get catalog cards, removed ones drop out, and photos and facts update. Writes no copy and moves no hero. Returns the catalog as it stands after.",
  inputSchema: brandInput,
  examples: [{ brandId: "brd_01" }],
  execute: async ({ brandId }, ctx) => {
    const brand = await catalogBrand(ctx.userId, brandId);
    await ingestBrandHomes({ brandId: brand.id, website: brand.website });
    return catalogState(ctx.userId, brandId, true);
  },
});

export const newCatalogCopyAction = growthAction({
  outputSchema: newCatalogCopyActionOutputSchema,
  description:
    "Write a new headline (and amenity pills, on the amenities cards) for one home's catalog card with the card's photo in view, and save it. One model call. Refused on an approved card (reopen it first) and on a finished card, whose headline is part of the supplied artwork.",
  inputSchema: homeInput.extend({ steer: steerSchema }),
  examples: [{ brandId: "brd_01", homeId: "1234567890123" }],
  execute: async (input, ctx) =>
    newCatalogCopy({
      ...input,
      homeId: await catalogListingId(input.brandId, input.homeId),
      userId: ctx.userId,
    }),
});

export const newCatalogPhotoAction = growthAction({
  outputSchema: newCatalogPhotoActionOutputSchema,
  description:
    "Pick a better hero for one home's catalog card from its listing photos and make it the home's hero, so its ads and previews follow. Then rewrites the headline (and pills) for the new photo, replacing any edited headline: use it when photo and copy should change together, and adsWrite.setHomeHero to change only the photo. Never picks the current hero again. Refused on an approved card. Fails with the reason when no clean photo is left.",
  inputSchema: homeInput.extend({ steer: steerSchema }),
  examples: [{ brandId: "brd_01", homeId: "1234567890123" }],
  execute: async (raw, ctx) => {
    const input = {
      ...raw,
      homeId: await catalogListingId(raw.brandId, raw.homeId),
    };
    const state = await catalogState(ctx.userId, input.brandId);
    if (
      state.draft.cards.find((card) => card.homeId === input.homeId)?.mode ===
      "finished"
    )
      throw new Error(
        "This card uses supplied artwork. Choose new artwork instead of regenerating its photo and copy.",
      );
    const picked = await newCatalogPhoto({ ...input, userId: ctx.userId });
    try {
      await newCatalogCopy({ ...input, userId: ctx.userId });
    } catch (error) {
      throw new Error(
        `The photo was updated, but copy could not be rewritten. Use New copy to retry. ${error instanceof Error ? error.message : ""}`,
      );
    }
    return {
      homeId: picked.homeId,
      photoNumber: picked.photoNumber ?? null,
      heroUrl: picked.heroUrl ?? null,
      reason: picked.reason,
    };
  },
});

export const writeCatalogCardsAction = growthAction({
  outputSchema: writeCatalogCardsActionOutputSchema,
  description:
    "Rework every catalog card still open for changes (included, not approved, not supplied artwork) in the background, the same as Rewrite copy (pass copy: new copy for each card's template on the photo it has) or Fix photos + copy (pass photosAndCopy: check each hero, swap a weak one, then write the copy) in the Studio. Returns the run at once; follow it with catalogWriteStatus. A run already going for the brand is returned rather than started twice. Approved and supplied cards are never touched.",
  inputSchema: brandInput.extend({ pass: z.enum(CATALOG_WRITE_PASSES) }),
  examples: [
    { brandId: "brd_01", pass: "copy" },
    { brandId: "brd_01", pass: "photosAndCopy" },
  ],
  execute: async (input, ctx) => {
    const { homeIds, ...result } = await startCatalogWrite({
      ...input,
      userId: ctx.userId,
    });
    if (result.started)
      after(() =>
        runCatalogWrite(result.run.runId, {
          ...input,
          userId: ctx.userId,
          homeIds,
        }),
      );
    return result;
  },
});

export const setCatalogApprovalAction = growthAction({
  outputSchema: setCatalogApprovalActionOutputSchema,
  description:
    "Sign catalog cards off as the operator saw them, or reopen them (approved false). Human approval locks edits until the card is reopened. Approved cards are locked and are what the export ships.",
  inputSchema: brandInput.extend({
    approved: z.boolean(),
    cards: z
      .array(
        z.object({
          homeId: z.string().min(1),
        }),
      )
      .min(1),
  }),
  examples: [
    {
      brandId: "brd_01",
      approved: false,
      cards: [{ homeId: "1234567890123" }],
    },
  ],
  execute: async (input, ctx) => {
    const ids = await catalogListingIds(
      input.brandId,
      input.cards.map((card) => card.homeId),
    );
    return setCatalogApproval({
      ...input,
      cards: input.cards.map((card, i) => ({ ...card, homeId: ids[i]! })),
      userId: ctx.userId,
    });
  },
});

export const setCatalogIncludedAction = growthAction({
  outputSchema: setCatalogIncludedActionOutputSchema,
  description:
    "Include every home in a Performance client's catalog export, or exclude them all. For one home, use editCatalogCard with included.",
  inputSchema: brandInput.extend({ included: z.boolean() }),
  examples: [{ brandId: "brd_01", included: true }],
  execute: async (input, ctx) => {
    await setCatalogIncluded({ ...input, userId: ctx.userId });
    return input;
  },
});

export const setCatalogDefaultTemplateAction = growthAction({
  outputSchema: setCatalogDefaultTemplateActionOutputSchema,
  description:
    "Set the catalog card template every home uses unless its card has its own. Headlines were written for the old template, so offer writeCatalogCards with pass copy afterwards.",
  inputSchema: brandInput.extend({ templateId: z.enum(CATALOG_TEMPLATES) }),
  examples: [{ brandId: "brd_01", templateId: "catalog-place" }],
  execute: async (input, ctx) => {
    await setCatalogDefaultTemplate({ ...input, userId: ctx.userId });
    return input;
  },
});

export const setCatalogAdCopyAction = growthAction({
  outputSchema: setCatalogAdCopyActionOutputSchema,
  description:
    "Save the primary text a Performance client's catalog ad runs with: the same above every card. Each card's own headline and description are on the card (editCatalogCard adHeadline and adDescription). Each export freezes this copy with its cards. Nothing reaches Meta.",
  inputSchema: brandInput.extend({ ad: catalogAdCopySchema }),
  examples: [
    {
      brandId: "brd_01",
      ad: {
        primaryText: "",
      },
    },
  ],
  execute: async (input, ctx) => ({
    brandId: input.brandId,
    ad: await setCatalogAdCopy({ ...input, userId: ctx.userId }),
  }),
});

export const writeCatalogAdCopyAction = growthAction({
  outputSchema: writeCatalogAdCopyActionOutputSchema,
  description:
    "Rewrite the ad headline and description Meta prints under each catalog card, from each home's listing: the headline names the home, the description is one front-loaded line of facts. Every included card, or only homeIds. headlineOnly keeps each card's description. Approved cards take it: ad copy is not part of the approval. Saves the cards; nothing reaches Meta until the next export.",
  inputSchema: brandInput.extend({
    homeIds: z
      .array(z.string().min(1))
      .min(1)
      .optional()
      .describe("WanderOS listing ids; every included card when omitted."),
    headlineOnly: z.boolean().optional(),
  }),
  examples: [{ brandId: "brd_01" }, { brandId: "brd_01", headlineOnly: true }],
  execute: async ({ homeIds, ...input }, ctx) =>
    writeCatalogAdCopy({
      ...input,
      homeIds: homeIds && (await catalogListingIds(input.brandId, homeIds)),
      userId: ctx.userId,
    }),
});

export const exportCatalogAction = growthAction({
  outputSchema: exportCatalogActionOutputSchema,
  description:
    "Freeze the included catalog cards into a new export: renders every changed card into the brand's media library in the background, copies unchanged ones from the last export, and snapshots the matching feed rows. fresh redraws every card. Refused until every included card is approved. Returns the run id at once; its progress is in catalogState's exports. Nothing is uploaded to an ad platform.",
  inputSchema: brandInput.extend({ fresh: z.boolean().optional() }),
  examples: [{ brandId: "brd_01" }],
  execute: async ({ brandId, fresh }, ctx) => {
    const run = await startCatalogExport(ctx.userId, brandId);
    after(() => renderCatalogExport({ ...run, fresh }, ctx.userId));
    return { runId: run.run.id };
  },
});

export const deleteCatalogExportAction = growthAction({
  outputSchema: deleteCatalogExportActionOutputSchema,
  description:
    "Delete one catalog export for good: the run, its media library folder and every image in it. Other exports keep their own copies. Refused while the export is still rendering.",
  inputSchema: brandInput.extend({ runId: z.string().min(1) }),
  examples: [{ brandId: "brd_01", runId: "crun_01" }],
  execute: ({ brandId, runId }, ctx) =>
    deleteCatalogExport(ctx.userId, brandId, runId),
});
