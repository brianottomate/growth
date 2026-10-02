import "server-only";
import { NextResponse } from "next/server";

/** Browser writes must originate from this connection page, not an embedded third-party form. */
export function acceptsEmailDnsPost(request: Request) {
  return (
    request.headers.get("origin") === new URL(request.url).origin &&
    request.headers.get("content-type")?.split(";")[0] === "application/json"
  );
}

export async function emailDnsResponse(
  request: Request,
  token: string,
  action: (token: string) => Promise<unknown>,
) {
  const headers = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  };
  if (!acceptsEmailDnsPost(request))
    return NextResponse.json(
      { error: "Open the connection page to continue." },
      { status: 403, headers },
    );
  try {
    const result = await action(token);
    return result
      ? NextResponse.json(result, { headers })
      : NextResponse.json(
          {
            error:
              "This link is no longer active. Ask your Wander contact for a fresh link.",
          },
          { status: 404, headers },
        );
  } catch {
    return NextResponse.json(
      {
        error:
          "The provider could not complete this request. Try again, use the manual records, or contact Wander.",
      },
      { status: 503, headers },
    );
  }
}
