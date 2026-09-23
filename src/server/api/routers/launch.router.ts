import { actionProcedure } from "@/server/api/orpc";
import {
  createLaunchAction,
  listLaunchesAction,
  readLaunchAction,
  setLaunchBriefAction,
  setLaunchDeliverableAction,
  setLaunchFeaturesAction,
  setLaunchFieldsAction,
} from "@/server/ai/capabilities/launch";

export const launchRouter = {
  list: actionProcedure(listLaunchesAction),
  get: actionProcedure(readLaunchAction),
  create: actionProcedure(createLaunchAction),
  setBrief: actionProcedure(setLaunchBriefAction),
  setFields: actionProcedure(setLaunchFieldsAction),
  setFeatures: actionProcedure(setLaunchFeaturesAction),
  setDeliverable: actionProcedure(setLaunchDeliverableAction),
};
