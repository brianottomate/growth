import type { NextRequest } from "next/server";
import { getSession } from "@/server/better-auth/server";
import { resolveWorkspaceOrganizationId } from "@/server/workspace-actor";
import {
  getEmailAudienceSnapshot,
  readEmailAudienceBatch,
} from "@/server/services/email-audience.service";
import { emailAudienceCsvRow } from "@/lib/email-audience";

export const maxDuration = 300;
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ snapshotId: string }> },
) {
  const session = await getSession();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const organizationId = await resolveWorkspaceOrganizationId({
    userId: session.user.id,
    preferredOrganizationId: session.session.activeOrganizationId,
  });
  const actor = { organizationId, userId: session.user.id };
  const { snapshotId } = await params;
  try {
    const snapshot = await getEmailAudienceSnapshot({ snapshotId }, actor);
    if (
      snapshot.status !== "ready" ||
      Date.parse(snapshot.expiresAt) <= Date.now()
    )
      return new Response("Compile a fresh snapshot first.", { status: 409 });
    const encoder = new TextEncoder();
    let pageToken: string | undefined;
    let headerSent = false;
    let cancelled = false;
    const stream = new ReadableStream({
      async pull(controller) {
        try {
          if (cancelled || request.signal.aborted) {
            controller.close();
            return;
          }
          if (!headerSent) {
            headerSent = true;
            controller.enqueue(
              encoder.encode("email,first_name,source_id,reason\r\n"),
            );
            return;
          }
          const batch = await readEmailAudienceBatch(
            { snapshotId, pageToken, pageSize: 10000 },
            actor,
          );
          if (cancelled) return;
          controller.enqueue(
            encoder.encode(batch.recipients.map(emailAudienceCsvRow).join("")),
          );
          pageToken = batch.nextPageToken ?? undefined;
          if (!pageToken) controller.close();
        } catch (error) {
          if (!cancelled) controller.error(error);
        }
      },
      cancel() {
        cancelled = true;
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${snapshotId}-candidates.csv"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Snapshot unavailable in this workspace.", {
      status: 404,
    });
  }
}
