import { emailDnsResponse } from "@/server/services/email-dns-http";
import { startEmailDnsConnection } from "@/server/services/email-dns.service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  return emailDnsResponse(
    request,
    (await params).token,
    startEmailDnsConnection,
  );
}
