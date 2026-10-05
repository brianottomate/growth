import { z } from "zod";
import { workspaceActor } from "@/server/workspace-actor";
import { uploadCampaignSeed } from "@/server/services/campaign-seed.service";
export const maxDuration = 300;
const inputSchema = z.object({
  audienceId: z.string().min(1),
  name: z.string().trim().min(1).max(255).optional(),
  source: z.enum(["csv", "bigquery"]),
  users: z
    .array(
      z.object({
        email: z.email().optional(),
        phone: z.string().trim().min(5).optional(),
      }),
    )
    .max(50000)
    .optional(),
  snapshotId: z.string().min(1).optional(),
  permissionConfirmed: z.literal(true),
});
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin)
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  const actor = await workspaceActor();
  if (!actor)
    return Response.json(
      { error: "Sign in to Wander Growth" },
      { status: 401 },
    );
  if (Number(request.headers.get("content-length") ?? 0) > 8000000)
    return Response.json({ error: "File is too large" }, { status: 413 });
  let parsed;
  try {
    const body = await request.text();
    if (body.length > 8000000)
      return Response.json({ error: "File is too large" }, { status: 413 });
    parsed = inputSchema.safeParse(JSON.parse(body));
  } catch {
    return Response.json({ error: "Invalid upload" }, { status: 400 });
  }
  if (!parsed.success)
    return Response.json(
      { error: "Invalid seed-list fields" },
      { status: 400 },
    );
  try {
    return Response.json(
      await uploadCampaignSeed(parsed.data, {
        organizationId: actor.orgId,
        userId: actor.userId,
      }),
    );
  } catch (error) {
    // Only service-owned messages; never return or log provider errors or recipient data.
    return Response.json(
      { error: error instanceof Error ? error.message : "Seed upload failed" },
      { status: 400 },
    );
  }
}
