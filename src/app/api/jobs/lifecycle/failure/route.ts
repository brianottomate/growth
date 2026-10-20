import { z } from "zod";
import { parseQstashFailureCallback } from "@/lib/qstash-failure-callback";
import {
  lifecycleUrl,
  verifyLifecycleJob,
} from "@/server/services/lifecycle-runtime/providers";
import { recordLifecycleQueueFailure } from "@/server/services/lifecycle-runtime/qstash-events";

export const runtime = "nodejs";
export const maxDuration = 60;

const jobSchema = z.object({
  deliveryId: z.string().min(1),
  runtimeId: z.string().min(1),
});

export async function POST(request: Request) {
  const body = await request.text();
  if (
    !(await verifyLifecycleJob(
      body,
      request.headers.get("upstash-signature") ?? "",
      "/api/jobs/lifecycle/failure",
    ))
  )
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  let input;
  try {
    const callback = parseQstashFailureCallback({
      body,
      expectedSourceUrl: lifecycleUrl("/api/jobs/lifecycle"),
      jobSchema,
    });
    input = { ...callback.job, sourceMessageId: callback.sourceMessageId };
  } catch {
    return Response.json({ error: "Invalid callback" }, { status: 400 });
  }
  try {
    await recordLifecycleQueueFailure(input);
    return Response.json({ recorded: true });
  } catch {
    return Response.json(
      { error: "Receipt unavailable; retry required" },
      { status: 503 },
    );
  }
}
