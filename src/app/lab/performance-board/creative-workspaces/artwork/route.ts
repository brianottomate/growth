import sharp from "sharp";
import { hasLabSession } from "@/server/lab-access";
import { compositionPreviewFromParams } from "@/lib/compositions";
import { renderComposition } from "@/server/services/composition.service";
import { BRAND, PHOTOS } from "../data";

const sources = new Map<string, Promise<string>>();
function source(url: string) {
  let promise = sources.get(url);
  if (!promise) {
    promise = fetch(url, { signal: AbortSignal.timeout(15000) })
      .then(async (response) => {
        if (!response.ok) throw new Error("Fixture photo unavailable");
        const image = await sharp(Buffer.from(await response.arrayBuffer()))
          .resize({ width: 1200, withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();
        return `data:image/jpeg;base64,${image.toString("base64")}`;
      })
      .catch((error: unknown) => {
        sources.delete(url);
        throw error;
      });
    sources.set(url, promise);
  }
  return promise;
}
/** Fixed fixture photos and in-memory rendering only: no brand lookup, media save or external job. */
export async function GET(request: Request) {
  if (!(await hasLabSession())) return new Response(null, { status: 404 });
  const params = new URL(request.url).searchParams;
  const photo = PHOTOS[Number(params.get("photo") ?? 0)];
  params.set("brandId", BRAND.id);
  const { parsed } = compositionPreviewFromParams(params);
  if (!photo || !parsed.success)
    return new Response("Invalid fixture artwork", { status: 400 });
  try {
    const image = renderComposition(parsed.data, {
      brand: {
        ...BRAND,
        logo: null,
        brandMark: null,
        organizationId: "fixture",
        brandIdentity: null,
      },
      templateId: parsed.data.templateId,
      sourceUrl: photo,
      sourceImage: await source(photo),
      fonts: null,
      logo: null,
    });
    const buffer = await sharp(Buffer.from(await image.arrayBuffer()))
      .resize({ width: 600 })
      .webp({ quality: 80 })
      .toBuffer();
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Fixture artwork could not render", error);
    return new Response("Fixture artwork unavailable", { status: 502 });
  }
}
