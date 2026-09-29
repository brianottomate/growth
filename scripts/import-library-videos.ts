/**
 * Upload local video files (editor exports) into a brand's media library the
 * way the browser does, then cut their renditions with the local ffmpeg.
 *
 *   bun --conditions=react-server scripts/import-library-videos.ts \
 *     --brand chalets-hh --email kristian@wander.com ~/Downloads/Videos/*.mov
 *
 * Prints one JSON line per file: media id, title and the rendition URLs.
 */
import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import { eq, or } from "drizzle-orm";

import { db } from "@/server/db";
import { brandTable, mediaAssetTable, userTable } from "@/server/db/schema";
import { MediaService } from "@/server/services/media.service";
import { renderVideoRenditions } from "@/server/services/video-rendition.service";

const MIME: Record<string, string> = {
  ".mov": "video/quicktime",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

const args = process.argv.slice(2);
const flag = (name: string) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? undefined : args.splice(at, 2)[1];
};
const brandRef = flag("brand");
const email = flag("email") ?? "kristian@wander.com";
const files = args;
if (!brandRef || !files.length) {
  console.error("Usage: --brand <slug|id> [--email <uploader>] <files...>");
  process.exit(1);
}

const brand = await db.query.brandTable.findFirst({
  where: or(eq(brandTable.slug, brandRef), eq(brandTable.id, brandRef)),
});
const user = await db.query.userTable.findFirst({
  where: eq(userTable.email, email),
});
if (!brand || !user) throw new Error(`No brand ${brandRef} or user ${email}`);

for (const path of files) {
  const mimeType = MIME[extname(path).toLowerCase()];
  if (!mimeType) throw new Error(`${path}: not a video the library takes`);
  const { size } = await stat(path);
  const filename = basename(path);
  const upload = await MediaService.createR2Upload({
    brandId: brand.id,
    uploadedBy: user.id,
    filename,
    mimeType,
    size,
  });
  const put = await fetch(upload.uploadUrl, {
    method: "PUT",
    headers: { "content-type": mimeType },
    body: await readFile(path),
  });
  if (!put.ok) throw new Error(`${filename}: R2 PUT ${put.status}`);
  await MediaService.finalizeR2Upload({
    mediaId: upload.mediaId,
    url: upload.publicUrl,
    pathname: upload.pathname,
  });
  await db
    .update(mediaAssetTable)
    .set({ title: basename(filename, extname(filename)) })
    .where(eq(mediaAssetTable.id, upload.mediaId));
  const renditions = await renderVideoRenditions(upload.mediaId);
  console.log(
    JSON.stringify({
      mediaId: upload.mediaId,
      filename,
      status: renditions?.status,
      error: renditions?.error,
      delivery: renditions?.delivery?.url,
      feed: renditions?.feed?.url,
    }),
  );
}
process.exit(0);
