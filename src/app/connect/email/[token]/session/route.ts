import { z } from "zod";
import { emailDnsResponse } from "@/server/services/email-dns-http";
import { startEmailDnsConnection } from "@/server/services/email-dns.service";

const optionsSchema = z.strictObject({
  includeStarterDmarc: z.boolean().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  return emailDnsResponse(request, (await params).token, async (token) => {
    const options = optionsSchema.parse(await request.json());
    return startEmailDnsConnection(token, options.includeStarterDmarc === true);
  });
}
