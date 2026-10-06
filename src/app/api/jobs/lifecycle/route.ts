import { z } from "zod";
import { verifyLifecycleJob } from "@/server/services/lifecycle-runtime/providers";
import { executeLifecycleDelivery } from "@/server/services/lifecycle-runtime/worker";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  const body = await request.text();
  if (
    !(await verifyLifecycleJob(
      body,
      request.headers.get("upstash-signature") ?? "",
    ))
  )
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  let input;
  try {
    input = z
      .object({ deliveryId: z.string().min(1), runtimeId: z.string().min(1) })
      .parse(JSON.parse(body));
  } catch {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }
  try {
    return Response.json(
      await executeLifecycleDelivery(input.deliveryId, input.runtimeId),
    );
  } catch {
    return Response.json(
      { error: "Delivery unavailable; retry required" },
      { status: 503 },
    );
  }
}
