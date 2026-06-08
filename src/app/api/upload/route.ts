import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getSession } from "@/server/better-auth/server";
import { R2 } from "@/server/clients/r2.client";
import { createId } from "@/server/db/utils";

/**
 * Generic image upload → Cloudflare R2 (same store as the media library).
 * Backs org logos, profile images, and the shared ImageUpload component.
 *
 * Drop-in replacement for the retired `/api/blob/upload` (Vercel Blob): same
 * query params (`filename`, `resourceType`, `resourceId`) and the same JSON
 * result shape (`ImageUploadResult`). Unlike the old route it creates no
 * `attachment` row — callers persist the returned `url` on their own record
 * (org.logo, user.image, …).
 *
 * Files stream through the function body, so this is bounded to ~4.5MB (the
 * Vercel request-body limit) — plenty for logos/avatars. Large media goes
 * through the media library's presigned-PUT flow instead.
 */
const MAX_BYTES = 4.5 * 1024 * 1024;

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const filename = searchParams.get("filename") || "upload";
    const scope = searchParams.get("resourceType") || "general";
    const resourceId = searchParams.get("resourceId") || createId("upl");

    const file = await request.blob();
    if (!file || file.size === 0) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "Image exceeds 4.5MB" },
        { status: 413 },
      );
    }
    const contentType = file.type || "application/octet-stream";
    if (!contentType.startsWith("image/")) {
      return NextResponse.json(
        { error: "Only image uploads are supported" },
        { status: 415 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const key = R2.buildUploadKey(scope, resourceId, filename);
    const url = await R2.putBuffer(key, buffer, contentType);

    return NextResponse.json({
      url,
      pathname: key,
      contentType,
      size: file.size,
      filename,
    });
  } catch (error) {
    console.error("❌ Upload failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 },
    );
  }
}
