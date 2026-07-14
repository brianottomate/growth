import { z } from "zod";

import { applyFalWebhook } from "@/server/services/creative-work.service";

export const maxDuration = 30;

const bodySchema = z.object({
  request_id: z.string(),
  status: z.enum(["OK", "ERROR"]),
  payload: z.unknown().optional(),
  error: z.string().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return new Response("Unauthorized", { status: 401 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return new Response("Invalid payload", { status: 400 });

  const result = await applyFalWebhook({
    runId,
    token,
    requestId: parsed.data.request_id,
    status: parsed.data.status,
    payload: parsed.data.payload as
      | {
          images?: Array<{
            url?: string;
            width?: number;
            height?: number;
            content_type?: string;
          }>;
          seed?: number;
          prompt?: string;
        }
      | undefined,
    error: parsed.data.error,
  });
  if (!result) return new Response("Unauthorized", { status: 401 });
  return Response.json({ ok: true });
}
