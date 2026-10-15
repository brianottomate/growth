import { NextResponse, type NextRequest } from "next/server";

import { readUnsubscribeToken, recordOptOut } from "@/server/email/unsubscribe";

/**
 * POST unsubscribes. Mail clients send `List-Unsubscribe=One-Click` here
 * (RFC 8058) without a person present; the /u/<token> page posts its form
 * here and is sent back to see the result. GET only redirects to the page,
 * so a link scanner opening the URL unsubscribes no one.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const target = readUnsubscribeToken(token);
  if (!target)
    return NextResponse.json({ error: "Invalid link" }, { status: 400 });
  const body = await request.text();
  const oneClick = body.includes("List-Unsubscribe=One-Click");
  await recordOptOut({ ...target, source: oneClick ? "one_click" : "link" });
  if (oneClick) return new NextResponse(null, { status: 200 });
  return NextResponse.redirect(new URL(`/u/${token}`, request.url), 303);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  return NextResponse.redirect(new URL(`/u/${token}`, request.url), 303);
}
