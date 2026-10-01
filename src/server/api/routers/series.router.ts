import { actionProcedure } from "@/server/api/orpc";
import {
  saveContentSeries,
  clearContentSeries,
  deleteContentSeries,
} from "@/server/ai/capabilities/content-strategy";

export const seriesRouter = {
  save: actionProcedure(saveContentSeries),
  purge: actionProcedure(deleteContentSeries),
  clearForBrand: actionProcedure(clearContentSeries),
};
