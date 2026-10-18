import { actionProcedure } from "@/server/api/orpc";
import {
  listBoardsAction,
  readBoardAction,
  boardMediaAction,
  saveBoardAction,
  addBoardReferenceAction,
  editBoardReferencesAction,
  saveBoardProposalAction,
  acceptBoardProposalAction,
} from "@/server/ai/capabilities/reference-boards";
export const referenceBoardRouter = {
  list: actionProcedure(listBoardsAction),
  get: actionProcedure(readBoardAction),
  media: actionProcedure(boardMediaAction),
  save: actionProcedure(saveBoardAction),
  addReference: actionProcedure(addBoardReferenceAction),
  editReferences: actionProcedure(editBoardReferencesAction),
  saveProposal: actionProcedure(saveBoardProposalAction),
  acceptProposal: actionProcedure(acceptBoardProposalAction),
};
