import { NextResponse, type NextRequest } from "next/server";
import { requireGatewayAuth } from "@/server/services/hubspot-gateway.service";
import { clientPageViewSchema } from "@/lib/client-page-activity";
import { recordClientPageView } from "@/server/services/client-page-activity.service";

/** Called only by wander.com's server-side, authenticated gateway proxy. */
export async function POST(request: NextRequest) {
  const unauthorized = requireGatewayAuth(request);
  if (unauthorized) return unauthorized;
  const parsed = clientPageViewSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success || !["pitch", "intake"].includes(parsed.data.surface))
    return NextResponse.json({ error: "Invalid view" }, { status: 400 });
  const result = await recordClientPageView(parsed.data);
  return NextResponse.json(result ?? { error: "Not found" }, {
    status: result ? 200 : 404,
    headers: { "Cache-Control": "no-store" },
  });
}
