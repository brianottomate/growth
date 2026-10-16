import type { NextRequest } from "next/server";
import { getSession } from "@/server/better-auth/server";
import { resolveWorkspaceOrganizationId } from "@/server/workspace-actor";
import {
  requireSeedSnapshot,
  seedMembers,
} from "@/server/services/seeds/service";

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
    const { snapshot } = await requireSeedSnapshot(snapshotId, actor);
    const encoder = new TextEncoder();
    let afterHash: string | undefined;
    let header = false;
    let cancelled = false;
    const stream = new ReadableStream({
      async pull(controller) {
        try {
          if (cancelled || request.signal.aborted) {
            controller.close();
            return;
          }
          if (!header) {
            header = true;
            controller.enqueue(encoder.encode("EMAIL_SHA256\r\n"));
            return;
          }
          const page = await seedMembers(
            { snapshotId: snapshot.id, afterHash, limit: 10000 },
            actor,
          );
          if (cancelled) return;
          controller.enqueue(
            encoder.encode(
              page.members.map((m) => m.emailHash + "\r\n").join(""),
            ),
          );
          if (!page.nextAfterHash) {
            controller.close();
            return;
          }
          afterHash = page.nextAfterHash;
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
        "Content-Disposition": `attachment; filename="${snapshot.id}-sha256.csv"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Seed snapshot unavailable in this workspace", {
      status: 404,
    });
  }
}
