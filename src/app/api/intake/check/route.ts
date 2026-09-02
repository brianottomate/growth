import { NextResponse } from "next/server";
import { z } from "zod";

import { PerformanceError } from "@/server/services/performance.service";
import { checkAccessByToken } from "@/server/services/performance-intake.service";

const schema = z.object({ token: z.string().min(16) });

/**
 * "Did that grant work?", for the client mid-form.
 *
 * Public, so it is throttled per brand in the service and returns nothing an
 * unauthenticated caller should not see. It records no verification: this is
 * reassurance, and the fact we act on is stamped only by an operator session.
 *
 * A negative answer is deliberately soft. The client can finish the form
 * either way, because a grant that has not propagated yet must not leave
 * someone stuck on a page they cannot get past.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing link" }, { status: 400 });
  }

  try {
    const result = await checkAccessByToken({ token: parsed.data.token });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PerformanceError) {
      return NextResponse.json(
        { error: "This link is no longer active." },
        { status: 404 },
      );
    }
    console.error("intake access check failed", error);
    // Our upstream being unreachable is not the client's problem to solve, and
    // they can still finish, so this reads as "unknown" rather than "failed".
    return NextResponse.json({
      found: false,
      pageName: null,
      throttled: false,
    });
  }
}
