import { workspaceActor } from "@/server/workspace-actor";
import { NATIVE_TOOLS } from "@/server/ai/capabilities";
export async function GET(request: Request) {
  const actor = await workspaceActor();
  if (!actor) return new Response(null, { status: 401 });
  const tool = NATIVE_TOOLS.operationRead__status!;
  const input = tool.validationSchema.safeParse({
    runId: new URL(request.url).searchParams.get("runId"),
  });
  if (!input.success)
    return Response.json({ error: "A runId is required" }, { status: 400 });
  try {
    return Response.json(
      await tool.run(input.data, {
        ...actor,
        surface: "overview-chat",
        runId: "status-read",
      }),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "Operation unavailable" }, { status: 404 });
  }
}
