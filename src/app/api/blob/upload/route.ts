import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";

import { getSession } from "@/server/better-auth/server";
import { db } from "@/server/db";
import { attachmentTable, RESOURCE_TYPES } from "@/server/db/schema";
import { z } from "zod";

/**
 * Server-side upload endpoint for smaller files (≤4.5MB)
 * Uses direct server-to-blob upload via @vercel/blob
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Authenticate user
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get query params
    const searchParams = request.nextUrl.searchParams;
    const filename = searchParams.get("filename") || "upload";
    const alt = searchParams.get("alt") || "";
    const resourceType = searchParams.get("resourceType");
    const resourceId = searchParams.get("resourceId");

    // Get file from request body
    const file = await request.blob();
    if (!file || file.size === 0) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    console.log(`📤 Server upload: ${filename} (${file.size} bytes)`);
    console.log(`👤 User: ${session.user.id}`);
    console.log(`📦 Resource: ${resourceType}:${resourceId}`);

    // Upload to Vercel Blob
    const blob = await put(filename, file, {
      access: "public",
      addRandomSuffix: true,
    });

    console.log(`✅ Server upload completed: ${blob.url}`);

    // Create attachment record if resource info provided
    if (resourceType && resourceId) {
      // Validate resource type
      const resourceTypeResult = z.enum(RESOURCE_TYPES).safeParse(resourceType);
      if (resourceTypeResult.success) {
        console.log(
          `📎 Creating attachment record for ${resourceType}:${resourceId}`,
        );

        const [attachment] = await db
          .insert(attachmentTable)
          .values({
            resourceType: resourceTypeResult.data,
            resourceId,
            uploadedBy: session.user.id,
            filename: blob.pathname.split("/").pop() || filename,
            originalFilename: filename,
            mimeType: file.type || "application/octet-stream",
            size: file.size,
            url: blob.url,
            metadata: {
              blobPathname: blob.pathname,
              uploadType: "server",
              alt,
            },
          })
          .returning();

        console.log(`✅ Attachment record created: ${attachment?.id}`);
      }
    }

    // Return upload result
    return NextResponse.json({
      url: blob.url,
      pathname: blob.pathname,
      contentType: blob.contentType || file.type,
      size: file.size,
      filename: filename,
    });
  } catch (error) {
    console.error("❌ Server upload failed:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Upload failed",
      },
      { status: 500 },
    );
  }
}
