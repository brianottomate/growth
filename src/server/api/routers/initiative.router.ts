import { actionProcedure } from "@/server/api/orpc";
import {
  getInitiativeAction,
  initiativeOptionsAction,
  linkInitiativeAction,
  listInitiativesAction,
  saveInitiativeAction,
  unlinkInitiativeAction,
} from "@/server/ai/capabilities/initiatives";
export const initiativeRouter = {
  list: actionProcedure(listInitiativesAction),
  get: actionProcedure(getInitiativeAction),
  options: actionProcedure(initiativeOptionsAction),
  save: actionProcedure(saveInitiativeAction),
  link: actionProcedure(linkInitiativeAction),
  unlink: actionProcedure(unlinkInitiativeAction),
};
