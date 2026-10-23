import { actionProcedure } from "@/server/api/orpc";
import {
  attachBookingTargetAction,
  bookingTargetAvailabilityAction,
  bookingTargetsAction,
  changeHomeGroupHomesAction,
  deleteHomeGroupAction,
  groupOpenHomesAction,
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
  targetAvailability: actionProcedure(bookingTargetAvailabilityAction),
  groupOpenHomes: actionProcedure(groupOpenHomesAction),
  setWanderOsEnabled: actionProcedure(setWanderOsEnabledAction),
};
