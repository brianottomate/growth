import { getSession } from "@/server/better-auth/server";
import { resolveWorkspaceOrganizationId } from "@/server/workspace-actor";
import {
  getEmailAudience,
  readEmailAudienceRecipients,
} from "@/server/services/email-audience.service";
import { emailAudienceCsvRow } from "@/lib/email-audience";

export const maxDuration = 300;
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ audienceId: string }> },
) {
  const session = await getSession();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const organizationId = await resolveWorkspaceOrganizationId({
    userId: session.user.id,
    preferredOrganizationId: session.session.activeOrganizationId,
  });
  const actor = { organizationId, userId: session.user.id };
  const { audienceId } = await params;
  try {
    await getEmailAudience({ audienceId }, actor);
  } catch {
    return new Response("Audience unavailable in this workspace.", {
      status: 404,
    });
  }
  const recipients = await readEmailAudienceRecipients({ audienceId }, actor);
  return new Response(
    "email,first_name,source_id,reason\r\n" +
      recipients.map(emailAudienceCsvRow).join(""),
    {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${audienceId}-audience.csv"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
