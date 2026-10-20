import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { isHomeGroupSharePath } from "@/lib/home-group-share-privacy";
import { AUTH_RETURN_TO_HEADER } from "@/lib/auth-utils";

export function proxy(request: NextRequest): NextResponse {
  if (isHomeGroupSharePath(request.nextUrl.pathname)) {
    const response = ["GET", "HEAD"].includes(request.method)
      ? NextResponse.next()
      : new NextResponse(null, {
          status: 405,
          headers: { Allow: "GET, HEAD" },
        });
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.headers.set("CDN-Cache-Control", "no-store");
    response.headers.set("Vercel-CDN-Cache-Control", "no-store");
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  }
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(
    AUTH_RETURN_TO_HEADER,
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/app/:path*", "/home-groups/:path*"],
};
