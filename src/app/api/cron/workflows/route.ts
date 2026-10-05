import { NextResponse } from "next/server";
import { env } from "@/env";
import { recoverQueuedWorkflows } from "@/server/services/workflow-dispatch.service";
export const maxDuration = 800;
export async function GET(request: Request) {
  const token = request.headers.get("authorization");
  if (
    !token ||
    ![process.env.CRON_SECRET, env.ADMIN_TOKEN].some(
      (secret) => secret && token === `Bearer ${secret}`,
    )
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await recoverQueuedWorkflows());
}
