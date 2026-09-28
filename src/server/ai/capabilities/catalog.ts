import "server-only";

import { after } from "next/server";
import { z } from "zod";

import {
  CATALOG_TEMPLATES,
  CATALOG_WRITE_PASSES,
  CATALOG_FORMATS,
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
  catalogState,
  renderCatalogExport,
  setCatalogApproval,
  setCatalogDefaultTemplate,
  setCatalogFormat,
  setCatalogIncluded,
  startCatalogExport,
} from "@/server/services/catalog-studio.service";
import { ingestBrandHomes } from "@/server/services/homes.service";

import {
  catalogStateActionOutputSchema,
  catalogWriteStatusActionOutputSchema,
  exportCatalogActionOutputSchema,
  newCatalogCopyActionOutputSchema,
  newCatalogPhotoActionOutputSchema,
  setCatalogApprovalActionOutputSchema,
  setCatalogDefaultTemplateActionOutputSchema,
  setCatalogFormatActionOutputSchema,
  setCatalogIncludedActionOutputSchema,
  writeCatalogCardsActionOutputSchema,
} from "./outputs/catalog";
import { growthAction } from "./types";

const brandInput = z.object({ brandId: z.string().min(1) });
const homeInput = brandInput.extend({
  homeId: z.string().min(1).describe("The WanderOS listing id."),
  force: z
    .boolean()
    .optional()
    .describe(
      "Local development only: change an approved card anyway. Ignored when deployed.",
    ),
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
  inputSchema: homeInput,
  examples: [{ brandId: "brd_01", homeId: "1234567890123" }],
  execute: (input, ctx) => newCatalogCopy({ ...input, userId: ctx.userId }),
});

export const newCatalogPhotoAction = growthAction({
  outputSchema: newCatalogPhotoActionOutputSchema,
  description:
    "Pick a better hero for one home's catalog card from its listing photos and make it the home's hero, so its ads and previews follow. One model call; never picks the current hero again. Refused on an approved card. Fails with the reason when no clean photo is left.",
  inputSchema: homeInput,
  examples: [{ brandId: "brd_01", homeId: "1234567890123" }],
  execute: async (input, ctx) => {
    const picked = await newCatalogPhoto({ ...input, userId: ctx.userId });
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
    "Sign catalog cards off as the operator saw them, or reopen them (approved false). Approving needs each card's fingerprint as shown on the page, so a card that changed since is refused rather than approved unseen; from chat, reopen only, and ask the operator to approve on the page. Approved cards are locked and are what the export ships.",
  inputSchema: brandInput.extend({
    approved: z.boolean(),
    cards: z
      .array(
        z.object({
          homeId: z.string().min(1),
          fingerprint: z
            .string()
            .optional()
            .describe("The card's fingerprint as shown; required to approve."),
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
  execute: (input, ctx) => setCatalogApproval({ ...input, userId: ctx.userId }),
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

export const setCatalogFormatAction = growthAction({
  outputSchema: setCatalogFormatActionOutputSchema,
  description:
    "Set the canvas a Performance client's catalog is drawn and exported at: portrait (4:5, 1080x1350) or square (1:1, 1080x1080). Every card template works at both; supplied artwork must match. Copy does not change; the next export uses the new size.",
  inputSchema: brandInput.extend({ formatId: z.enum(CATALOG_FORMATS) }),
  examples: [{ brandId: "brd_01", formatId: "square" }],
  execute: async (input, ctx) => {
    await setCatalogFormat({ ...input, userId: ctx.userId });
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

export const exportCatalogAction = growthAction({
  outputSchema: exportCatalogActionOutputSchema,
  description:
    "Freeze the included catalog cards into a new export: renders every card into the brand's media library in the background and snapshots the matching feed rows. Refused until every included card is approved. Returns the run id at once; its progress is in catalogState's exports. Nothing is uploaded to an ad platform.",
  inputSchema: brandInput.extend({
    force: z
      .boolean()
      .optional()
      .describe(
        "Local development only: export with unapproved cards. Ignored when deployed.",
      ),
  }),
  examples: [{ brandId: "brd_01" }],
  execute: async ({ brandId, force }, ctx) => {
    const run = await startCatalogExport(ctx.userId, brandId, force);
    after(() => renderCatalogExport(run, ctx.userId));
    return { runId: run.run.id };
  },
});
