import { actionProcedure } from "@/server/api/orpc";
import {
  workbookListAction,
  workbookGetAction,
  workbookOptionsAction,
  workbookImportAction,
  workbookSaveAction,
  workbookApplyAction,
} from "@/server/ai/capabilities/content-workbooks";
export const contentWorkbookRouter = {
  list: actionProcedure(workbookListAction),
  get: actionProcedure(workbookGetAction),
  options: actionProcedure(workbookOptionsAction),
  import: actionProcedure(workbookImportAction),
  save: actionProcedure(workbookSaveAction),
  apply: actionProcedure(workbookApplyAction),
};
