import { NextResponse } from "next/server";

import { PerformanceError } from "@/server/services/performance.service";
import {
  submitIntakeSchema,
  submitPerformanceIntake,
} from "@/server/services/performance-intake.service";

/**
 * Public intake submission. The connect token in the body is the whole
 * credential, the same one /connect/[token] uses, so this route must never
 * accept an accountId or brandId from the caller — both are derived from it.
 *
 * Failures are deliberately vague to the client. A token probe should not be
 * able to tell "no such brand" apart from "brand not eligible", and the
 * person filling this in cannot act on our internal reason anyway.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request" }, { status: 400 });
  }

  const parsed = submitIntakeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "That submission was incomplete." },
      { status: 400 },
    );
  }

  try {
    const { intakeId } = await submitPerformanceIntake({
      token: parsed.data.token,
      answers: parsed.data.answers,
    });
    return NextResponse.json({ ok: true, intakeId });
  } catch (error) {
    if (error instanceof PerformanceError) {
      return NextResponse.json(
        { error: "This link is no longer active." },
        { status: 404 },
      );
    }
    console.error("intake submission failed", error);
    return NextResponse.json(
      { error: "We couldn't save that. Try again in a moment." },
      { status: 500 },
    );
  }
}
