import { z } from "zod";
import { setCatalogReady } from "@/server/services/catalog-studio.service";
import { protectedProcedure } from "@/server/api/orpc";
import { actionProcedure } from "@/server/api/orpc";
import {
  editCatalogCardAction,
  setHomeHeroAction,
} from "@/server/ai/capabilities/ads";
import {
  catalogStateAction,
  importWanderOsAction,
  wanderOsImportStatusAction,
  catalogWriteStatusAction,
  deleteCatalogExportAction,
  exportCatalogAction,
  newCatalogCopyAction,
  newCatalogPhotoAction,
  refreshCatalogHomesAction,
  setCatalogApprovalAction,
  setCatalogDefaultTemplateAction,
  setCatalogAdCopyAction,
  setCatalogIncludedAction,
  writeCatalogCardsAction,
  writeCatalogAdCopyAction,
} from "@/server/ai/capabilities/catalog";

/** The catalog Studio, served from the same actions chat and MCP call. */
export const catalogRouter = {
  state: actionProcedure(catalogStateAction),
  importWanderOs: actionProcedure(importWanderOsAction),
  wanderOsImportStatus: actionProcedure(wanderOsImportStatusAction),
  refreshHomes: actionProcedure(refreshCatalogHomesAction),
  editCard: actionProcedure(editCatalogCardAction),
  setHero: actionProcedure(setHomeHeroAction),
  newCopy: actionProcedure(newCatalogCopyAction),
  newPhoto: actionProcedure(newCatalogPhotoAction),
  setApproval: actionProcedure(setCatalogApprovalAction),
  setReady: protectedProcedure
    .input(
      z.object({
        brandId: z.string().min(1),
        homeIds: z.array(z.string().min(1)).min(1),
        ready: z.boolean(),
      }),
    )
    .handler(({ input, context }) =>
      setCatalogReady({ ...input, userId: context.session.user.id }),
    ),
  setIncluded: actionProcedure(setCatalogIncludedAction),
  setDefaultTemplate: actionProcedure(setCatalogDefaultTemplateAction),
  setAdCopy: actionProcedure(setCatalogAdCopyAction),
  exportCatalog: actionProcedure(exportCatalogAction),
  deleteExport: actionProcedure(deleteCatalogExportAction),
  writeCards: actionProcedure(writeCatalogCardsAction),
  writeAdCopy: actionProcedure(writeCatalogAdCopyAction),
  writeStatus: actionProcedure(catalogWriteStatusAction),
};
