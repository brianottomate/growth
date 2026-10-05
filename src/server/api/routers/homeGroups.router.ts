import { actionProcedure } from "@/server/api/orpc";
import {
  attachBookingTargetAction,
  bookingTargetsAction,
  changeHomeGroupHomesAction,
  deleteHomeGroupAction,
  homeGroupsAction,
  saveBookingTargetAction,
  saveHomeGroupAction,
  setPrimaryHomeGroupAction,
  setWanderOsEnabledAction,
} from "@/server/ai/capabilities/home-groups";
export const homeGroupsRouter = {
  context: actionProcedure(homeGroupsAction),
  save: actionProcedure(saveHomeGroupAction),
  changeHomes: actionProcedure(changeHomeGroupHomesAction),
  delete: actionProcedure(deleteHomeGroupAction),
  setPrimary: actionProcedure(setPrimaryHomeGroupAction),
  targets: actionProcedure(bookingTargetsAction),
  saveTarget: actionProcedure(saveBookingTargetAction),
  attachTarget: actionProcedure(attachBookingTargetAction),
  setWanderOsEnabled: actionProcedure(setWanderOsEnabledAction),
};
