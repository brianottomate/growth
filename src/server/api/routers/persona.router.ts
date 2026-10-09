import { actionProcedure } from "@/server/api/orpc";
import {
  assignPersonaAudienceAction,
  createPersona,
  createPersonaLookalikeAction,
  deletePersona,
  listPersonas,
  suggestPersonas,
  wanderOsResearchContext,
  updatePersona,
} from "@/server/ai/capabilities/personas";

export const personaRouter = {
  list: actionProcedure(listPersonas),
  suggest: actionProcedure(suggestPersonas),
  wanderOsContext: actionProcedure(wanderOsResearchContext),
  create: actionProcedure(createPersona),
  update: actionProcedure(updatePersona),
  delete: actionProcedure(deletePersona),
  // The Audiences tab's buttons. The click is the operator's approval of the
  // provider write, the same as the Launch button on a campaign.
  createLookalike: actionProcedure(createPersonaLookalikeAction),
  assignAudience: actionProcedure(assignPersonaAudienceAction),
};
