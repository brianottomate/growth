import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSession } from "@/server/better-auth/server";
import { R2 } from "@/server/clients/r2.client";
import { createId } from "@/server/db/utils";

// Small generated chat images use same-origin upload, avoiding storage CORS.
// Large user attachments continue to use the existing presigned upload flow.
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (request.headers.get("content-type") !== "image/jpeg") {
    return NextResponse.json({ error: "Expected JPEG" }, { status: 415 });
  }
  const maximum = 4 * 1024 * 1024;
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body?.getReader();
  if (!reader)
    return NextResponse.json({ error: "Missing image" }, { status: 400 });
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        return NextResponse.json(
          { error: "Image exceeds 4MB" },
          { status: 413 },
        );
      }
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks);
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
      return NextResponse.json({ error: "Invalid JPEG" }, { status: 415 });
    }
    const key = R2.buildUploadKey(
      "chat",
      session.user.id,
      `${createId("att")}-newsletter.jpg`,
    );
    const url = await R2.putBuffer(key, bytes, "image/jpeg");
    return NextResponse.json({ url });
  } catch (error) {
    console.error("Chat preview upload failed", error);
    return NextResponse.json({ error: "Image upload failed" }, { status: 500 });
  }
}
