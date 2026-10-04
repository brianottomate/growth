import { actionProcedure } from "@/server/api/orpc";
import {
  assignPersonaAudienceAction,
  createPersona,
  createPersonaLookalikeAction,
  deletePersona,
  listPersonas,
  suggestPersonas,
  updatePersona,
  uploadPersonaSeedListAction,
} from "@/server/ai/capabilities/personas";

export const personaRouter = {
  list: actionProcedure(listPersonas),
  suggest: actionProcedure(suggestPersonas),
  create: actionProcedure(createPersona),
  update: actionProcedure(updatePersona),
  delete: actionProcedure(deletePersona),
  // The Audiences tab's buttons. The click is the operator's approval of the
  // provider write, the same as the Launch button on a campaign.
  uploadSeedList: actionProcedure(uploadPersonaSeedListAction),
  createLookalike: actionProcedure(createPersonaLookalikeAction),
  assignAudience: actionProcedure(assignPersonaAudienceAction),
};
