import { actionProcedure } from "@/server/api/orpc";
import {
  clearContentSeries,
  deleteContentSeries,
} from "@/server/ai/capabilities/content-strategy";

export const seriesRouter = {
  purge: actionProcedure(deleteContentSeries),
  clearForBrand: actionProcedure(clearContentSeries),
};
