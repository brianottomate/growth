import { actionProcedure } from "@/server/api/orpc";
import {
  listSeedsAction,
  buildSeedAction,
  rebuildSeedAction,
  readSeedAction,
  seedMembersAction,
  uploadSeedAction,
  seedAssetStatusAction,
  seedLookalikeAction,
  attachSeedAssetAction,
  shareSeedLookalikeAction,
  seedDeliveriesAction,
} from "@/server/ai/capabilities/seeds";
export const seedRouter = {
  list: actionProcedure(listSeedsAction),
  build: actionProcedure(buildSeedAction),
  rebuild: actionProcedure(rebuildSeedAction),
  get: actionProcedure(readSeedAction),
  members: actionProcedure(seedMembersAction),
  upload: actionProcedure(uploadSeedAction),
  assetStatus: actionProcedure(seedAssetStatusAction),
  lookalike: actionProcedure(seedLookalikeAction),
  attach: actionProcedure(attachSeedAssetAction),
  share: actionProcedure(shareSeedLookalikeAction),
  deliveries: actionProcedure(seedDeliveriesAction),
};
