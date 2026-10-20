import {
  homeGroupShareRevisionInput,
  saveHomeGroupShareInput,
  shareExistingHomeGroupInput,
} from "@/lib/home-group-shares";
import { workspaceProcedure } from "@/server/api/orpc";
import {
  listHomeGroupShareHomes,
  listHomeGroupShareClients,
  deleteHomeGroupShare,
  listShareableHomeGroups,
  shareExistingHomeGroup,
  listHomeGroupShares,
  renewHomeGroupShareLink,
  revokeHomeGroupShare,
  saveHomeGroupShare,
} from "@/server/services/home-group-shares.service";

export const homeGroupSharesRouter = {
  remove: workspaceProcedure
    .input(homeGroupShareRevisionInput)
    .handler(({ context, input }) =>
      deleteHomeGroupShare(input, context.workspace),
    ),
  clients: workspaceProcedure.handler(({ context }) =>
    listHomeGroupShareClients(context.workspace.orgId),
  ),
  groups: workspaceProcedure.handler(({ context }) =>
    listShareableHomeGroups(context.workspace.orgId),
  ),
  share: workspaceProcedure
    .input(shareExistingHomeGroupInput)
    .handler(({ context, input }) =>
      shareExistingHomeGroup(input, context.workspace),
    ),
  list: workspaceProcedure.handler(({ context }) =>
    listHomeGroupShares(context.workspace.orgId),
  ),
  homes: workspaceProcedure.handler(({ context }) =>
    listHomeGroupShareHomes(context.workspace.orgId),
  ),
  save: workspaceProcedure
    .input(saveHomeGroupShareInput)
    .handler(({ context, input }) =>
      saveHomeGroupShare(input, context.workspace),
    ),
  revoke: workspaceProcedure
    .input(homeGroupShareRevisionInput)
    .handler(({ context, input }) =>
      revokeHomeGroupShare(input, context.workspace),
    ),
  renew: workspaceProcedure
    .input(homeGroupShareRevisionInput)
    .handler(({ context, input }) =>
      renewHomeGroupShareLink(input, context.workspace),
    ),
};
