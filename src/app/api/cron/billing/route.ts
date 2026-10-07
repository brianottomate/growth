import { NextResponse, type NextRequest } from "next/server";
import { generateBillingCycles } from "@/server/services/billing-cycles.service";
export const maxDuration = 300;
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await generateBillingCycles());
}
