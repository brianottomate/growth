import { type NextRequest, NextResponse } from "next/server";
import {
  deleteOutreachWebhookById,
  isOutreachConfigured,
  isOutreachError,
} from "@/server/clients/outreach.client";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isOutreachConfigured) {
    return NextResponse.json(
      { success: false, error: "Outreach is not configured" },
      { status: 500 },
    );
  }

  const { id } = await params;

  try {
    await deleteOutreachWebhookById(id);
    console.log(`✅ [Outreach Webhooks] Deleted id=${id}`);
    return NextResponse.json({ success: true, deleted: id });
  } catch (error) {
    console.error(`❌ [Outreach Webhooks] Delete error id=${id}:`, error);
    if (isOutreachError(error)) {
      return NextResponse.json(
        { success: false, error: error.message, statusCode: error.statusCode },
        { status: error.statusCode ?? 500 },
      );
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
