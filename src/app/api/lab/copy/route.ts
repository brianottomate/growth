import { NextResponse, type NextRequest } from "next/server";

import { copyLabRunSchema } from "@/lib/copy-lab";
import { assertLabAccess } from "@/server/lab-access";
import { runCopyLab } from "@/server/services/copy-lab.service";

export const maxDuration = 300;

/** One copy-lab cell: a fixture through a production copy call with a tune. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await assertLabAccess(request);
  if (denied) return denied;

  try {
    const input = copyLabRunSchema.parse(await request.json());
    return NextResponse.json(await runCopyLab(input));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Run failed" },
      { status: 400 },
    );
  }
}
