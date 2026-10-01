import { actionProcedure } from "@/server/api/orpc";
import {
  attachBookingTargetAction,
  bookingTargetsAction,
  changeHomeGroupHomesAction,
  deleteHomeGroupAction,
  homeGroupsAction,
  saveBookingTargetAction,
  saveHomeGroupAction,
  setWanderOsEnabledAction,
} from "@/server/ai/capabilities/home-groups";
export const homeGroupsRouter = {
  context: actionProcedure(homeGroupsAction),
  save: actionProcedure(saveHomeGroupAction),
  changeHomes: actionProcedure(changeHomeGroupHomesAction),
  delete: actionProcedure(deleteHomeGroupAction),
  targets: actionProcedure(bookingTargetsAction),
  saveTarget: actionProcedure(saveBookingTargetAction),
  attachTarget: actionProcedure(attachBookingTargetAction),
  setWanderOsEnabled: actionProcedure(setWanderOsEnabledAction),
};
