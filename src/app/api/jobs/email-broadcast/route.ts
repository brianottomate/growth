import { z } from "zod";
import { verifyLifecycleJob } from "@/server/services/lifecycle-runtime/providers";
import { executeBroadcastJob } from "@/server/services/broadcast-schedule.service";
export const runtime = "nodejs";
export const maxDuration = 800;
export async function POST(request: Request) {
  const body = await request.text();
  if (
    !(await verifyLifecycleJob(
      body,
      request.headers.get("upstash-signature") ?? "",
      "/api/jobs/email-broadcast",
    ))
  )
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  let input;
  try {
    input = z
      .object({
        messageSendId: z.string().min(1),
        dueAt: z.iso.datetime(),
        runtimeId: z.string().min(1),
      })
      .parse(JSON.parse(body));
  } catch {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }
  try {
    return Response.json(await executeBroadcastJob(input));
  } catch {
    return Response.json(
      { error: "Delivery unavailable; inspect send status before recovery" },
      { status: 503 },
    );
  }
}
