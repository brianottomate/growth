import { actionProcedure } from "@/server/api/orpc";
import {
  createPersona,
  deletePersona,
  listPersonas,
  updatePersona,
} from "@/server/ai/capabilities/personas";

export const personaRouter = {
  list: actionProcedure(listPersonas),
  create: actionProcedure(createPersona),
  update: actionProcedure(updatePersona),
  delete: actionProcedure(deletePersona),
};
