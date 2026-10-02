import "server-only";
import { getSession } from "@/server/better-auth/server";
import { getWanderMembership } from "@/server/wander-workspace";
import { ChatTurnError } from "./chat-turn.service";

export async function chatActor() {
  const session = await getSession();
  if (!session?.user) throw new ChatTurnError("Unauthorized", 401);
  const membership = await getWanderMembership(session.user.id);
  if (!membership) throw new ChatTurnError("No access to Wander Growth", 403);
  return {
    userId: session.user.id,
    organizationId: membership.organizationId,
  };
}
