import { workspaceActor } from "@/server/workspace-actor";
import { requireOwnedCampaign } from "@/server/services/ads-draft.service";
import { campaignAdExport } from "@/server/services/campaign-ad-export.service";

export const maxDuration = 300;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  const actor = await workspaceActor();
  if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { campaignId } = await params;
  try {
    await requireOwnedCampaign(campaignId, actor.orgId);
  } catch {
    return Response.json({ error: "Campaign not found" }, { status: 404 });
  }
  try {
    const result = await campaignAdExport({ ...actor, campaignId });
    return new Response(result.body, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not export campaign ads",
      },
      { status: 400 },
    );
  }
}
