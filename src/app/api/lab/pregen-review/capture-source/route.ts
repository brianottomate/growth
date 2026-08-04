import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { assertLabAccess } from "@/server/lab-access";
import { capturePregenSourceVisual } from "@/server/services/pregen/source-visual";

export const maxDuration = 300;

const bodySchema = z.object({
  buildId: z.string().min(1),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await assertLabAccess(request);
  if (denied) return denied;

  try {
    const { buildId } = bodySchema.parse(await request.json());
    const receipt = await capturePregenSourceVisual(buildId);
    return NextResponse.json({ receipt });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Capture failed" },
      { status: 400 },
    );
  }
}
