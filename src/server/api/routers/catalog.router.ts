import { actionProcedure } from "@/server/api/orpc";
import {
  editCatalogCardAction,
  setHomeHeroAction,
} from "@/server/ai/capabilities/ads";
import {
  catalogStateAction,
  catalogWriteStatusAction,
  deleteCatalogExportAction,
  exportCatalogAction,
  newCatalogCopyAction,
  newCatalogPhotoAction,
  refreshCatalogHomesAction,
  setCatalogApprovalAction,
  setCatalogDefaultTemplateAction,
  setCatalogIncludedAction,
  writeCatalogCardsAction,
} from "@/server/ai/capabilities/catalog";

/** The catalog Studio, served from the same actions chat and MCP call. */
export const catalogRouter = {
  state: actionProcedure(catalogStateAction),
  refreshHomes: actionProcedure(refreshCatalogHomesAction),
  editCard: actionProcedure(editCatalogCardAction),
  setHero: actionProcedure(setHomeHeroAction),
  newCopy: actionProcedure(newCatalogCopyAction),
  newPhoto: actionProcedure(newCatalogPhotoAction),
  setApproval: actionProcedure(setCatalogApprovalAction),
  setIncluded: actionProcedure(setCatalogIncludedAction),
  setDefaultTemplate: actionProcedure(setCatalogDefaultTemplateAction),
  exportCatalog: actionProcedure(exportCatalogAction),
  deleteExport: actionProcedure(deleteCatalogExportAction),
  writeCards: actionProcedure(writeCatalogCardsAction),
  writeStatus: actionProcedure(catalogWriteStatusAction),
};
