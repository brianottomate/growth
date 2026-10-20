import { actionProcedure } from "@/server/api/orpc";
import {
  listPartnerships,
  savePartnership,
  removePartnership,
} from "@/server/ai/capabilities/influencer-partnerships";
export const influencerPartnershipsRouter = {
  list: actionProcedure(listPartnerships),
  save: actionProcedure(savePartnership),
  remove: actionProcedure(removePartnership),
};
