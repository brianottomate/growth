import { z } from "zod";
import {
  lifecycleUrl,
  verifyLifecycleJob,
} from "@/server/services/lifecycle-runtime/providers";
import { recordLifecycleQueueFailure } from "@/server/services/lifecycle-runtime/qstash-events";

export const runtime = "nodejs";
export const maxDuration = 60;

const callbackSchema = z.object({
  sourceMessageId: z.string().min(1),
  sourceBody: z.string().min(1).max(4_096),
  url: z.string().url(),
});
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
    const callback = callbackSchema.parse(JSON.parse(body));
    if (callback.url !== lifecycleUrl("/api/jobs/lifecycle"))
      return Response.json({ error: "Unexpected source" }, { status: 400 });
    const job = jobSchema.parse(
      JSON.parse(Buffer.from(callback.sourceBody, "base64").toString("utf8")),
    );
    input = { ...job, sourceMessageId: callback.sourceMessageId };
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
