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
  setIncluded: actionProcedure(setCatalogIncludedAction),
  setDefaultTemplate: actionProcedure(setCatalogDefaultTemplateAction),
  setAdCopy: actionProcedure(setCatalogAdCopyAction),
  exportCatalog: actionProcedure(exportCatalogAction),
  deleteExport: actionProcedure(deleteCatalogExportAction),
  writeCards: actionProcedure(writeCatalogCardsAction),
  writeStatus: actionProcedure(catalogWriteStatusAction),
};
