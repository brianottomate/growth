import { z } from "zod";
import { workspaceActor } from "@/server/workspace-actor";
import { readWorkspaceChanges } from "@/server/services/workspace-changes.service";
export async function GET(request: Request) {
  const actor = await workspaceActor();
  if (!actor) return new Response(null, { status: 401 });
  const value = z.iso
    .datetime()
    .safeParse(new URL(request.url).searchParams.get("since"));
  if (!value.success)
    return Response.json(
      { error: "A valid since timestamp is required" },
      { status: 400 },
    );
  return Response.json(
    await readWorkspaceChanges(actor.orgId, new Date(value.data)),
    { headers: { "Cache-Control": "no-store" } },
  );
}
