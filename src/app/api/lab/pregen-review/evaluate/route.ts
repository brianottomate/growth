import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { assertLabAccess } from "@/server/lab-access";
import { runPregenEvaluations } from "@/server/services/pregen/evaluation";

export const maxDuration = 300;

const bodySchema = z.object({
  buildId: z.string().min(1),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await assertLabAccess(request);
  if (denied) return denied;

  try {
    const { buildId } = bodySchema.parse(await request.json());
    const { receipts } = await runPregenEvaluations(buildId);
    return NextResponse.json({
      receipts: receipts.map((receipt) => ({
        id: receipt.id,
        kind: receipt.kind,
        status: receipt.status,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Evaluation failed" },
      { status: 400 },
    );
  }
}
