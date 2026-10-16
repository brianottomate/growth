import { actionProcedure } from "@/server/api/orpc";
import {
  attachSeedAssetAction,
  buildSeedAction,
  listSeedsAction,
  refreshSeedAction,
  seedAssetStatusAction,
  seedDeliveriesAction,
  seedLookalikeAction,
  shareSeedLookalikeAction,
  uploadSeedAction,
} from "@/server/ai/capabilities/seeds";
export const seedRouter = {
  list: actionProcedure(listSeedsAction),
  deliveries: actionProcedure(seedDeliveriesAction),
  assetStatus: actionProcedure(seedAssetStatusAction),
  build: actionProcedure(buildSeedAction),
  refresh: actionProcedure(refreshSeedAction),
  upload: actionProcedure(uploadSeedAction),
  lookalike: actionProcedure(seedLookalikeAction),
  share: actionProcedure(shareSeedLookalikeAction),
  attach: actionProcedure(attachSeedAssetAction),
};
