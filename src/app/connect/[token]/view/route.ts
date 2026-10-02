import { emailDnsResponse } from "@/server/services/email-dns-http";
import { recordClientPageView } from "@/server/services/client-page-activity.service";
import { z } from "zod";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  return emailDnsResponse(request, (await params).token, async (handle) => {
    const body = z
      .object({ visitId: z.string().uuid() })
      .safeParse(await request.json().catch(() => null));
    return body.success
      ? recordClientPageView({
          surface: "social_connect",
          handle,
          visitId: body.data.visitId,
        })
      : null;
  });
}
