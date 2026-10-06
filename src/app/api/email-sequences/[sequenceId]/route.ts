import { ORPCError } from "@orpc/server";
import { z } from "zod";
import {
  lifecycleEnrollmentSchema,
  lifecycleProfileSchema,
} from "@/lib/validators/lifecycle-runtime";
import {
  authenticateJourney,
  enrollRecipient,
  updateRecipientProfile,
} from "@/server/services/lifecycle-runtime/service";
export const runtime = "nodejs";
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("enroll"), data: lifecycleEnrollmentSchema }),
  z.object({ action: z.literal("profile"), data: lifecycleProfileSchema }),
]);
export async function POST(
  request: Request,
  context: { params: Promise<{ sequenceId: string }> },
) {
  const { sequenceId } = await context.params;
  const token =
    request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const scope = await authenticateJourney(sequenceId, token);
  if (!scope) return Response.json({ error: "Unauthorized" }, { status: 401 });
  let input;
  try {
    const body = await request.text();
    if (body.length > 150_000)
      return Response.json({ error: "Payload too large" }, { status: 413 });
    input = schema.parse(JSON.parse(body));
  } catch {
    return Response.json({ error: "Invalid lifecycle event" }, { status: 400 });
  }
  try {
    const result =
      input.action === "enroll"
        ? await enrollRecipient(scope.organizationId, sequenceId, input.data)
        : await updateRecipientProfile(
            scope.organizationId,
            sequenceId,
            input.data,
          );
    return Response.json(result, {
      // The source must retry the same event if the first publish failed.
      // Enrollment is durable and eventId makes that retry idempotent.
      status: "queued" in result && !result.queued ? 503 : 200,
      ...("queued" in result && !result.queued
        ? { headers: { "Retry-After": "60" } }
        : {}),
    });
  } catch (error) {
    if (error instanceof ORPCError)
      return Response.json(
        { error: error.message },
        { status: error.code === "CONFLICT" ? 409 : 400 },
      );
    return Response.json(
      { error: "Lifecycle service unavailable" },
      { status: 503 },
    );
  }
}
