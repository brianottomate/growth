import "server-only";
import JSZip from "jszip";
import { Readable } from "node:stream";
import { eq, asc } from "drizzle-orm";
import { db } from "@/server/db";
import { adTable } from "@/server/db/schema";
import {
  adExportCsv,
  exportAdCopy,
  exportFilename,
} from "@/lib/campaign-ad-export";
import { ideaPreviewUrl } from "@/lib/ad-idea-studio";
import { compositionPreviewFromParams } from "@/lib/compositions";
import { requireOwnedCampaign } from "./ads-draft.service";
import { fetchPublicImage } from "./media.service";
import { classifyFetchUrl } from "@/server/ai/url-safety";
import {
  loadCompositionSource,
  renderComposition,
  resolveCompositionContext,
} from "./composition.service";

async function videoFile(url: string) {
  let current = url;
  for (let redirects = 0; redirects <= 4; redirects++) {
    const classified = classifyFetchUrl(current);
    if (!classified.ok || !classified.url)
      throw new Error("Video URL is not safe to download");
    const response = await fetch(classified.url, {
      redirect: "manual",
      signal: AbortSignal.timeout(60_000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Video redirect has no destination");
      current = new URL(location, classified.url).href;
      continue;
    }
    if (!response.ok)
      throw new Error(`Video download failed (${response.status})`);
    const type = response.headers.get("content-type")?.split(";")[0] ?? "";
    if (!type.startsWith("video/"))
      throw new Error("Video URL did not return a video");
    const limit = 250 * 1024 * 1024;
    if (Number(response.headers.get("content-length")) > limit)
      throw new Error("Video exceeds 250 MB");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > limit) throw new Error("Video exceeds 250 MB");
    return {
      bytes,
      extension:
        type === "video/quicktime"
          ? "mov"
          : type === "video/webm"
            ? "webm"
            : "mp4",
    };
  }
  throw new Error("Video redirected too many times");
}

/** Download the campaign's current ads. No snapshots, library assets or export rows. */
export async function campaignAdExport(input: {
  orgId: string;
  userId: string;
  campaignId: string;
}) {
  const { campaign, brand } = await requireOwnedCampaign(
    input.campaignId,
    input.orgId,
  );
  const ads = await db.query.adTable.findMany({
    where: eq(adTable.campaignId, campaign.id),
    orderBy: [asc(adTable.createdAt), asc(adTable.id)],
  });
  if (!ads.length)
    throw new Error("This campaign has no assigned ads to download");
  const zip = new JSZip();
  const rows: (string | number)[][] = [
    [
      "Ad ID",
      "Ad name",
      "Status",
      "Size",
      "Card",
      "Headline",
      "Primary text",
      "Description",
      "Call to action",
      "Destination URL",
      "File",
    ],
  ];
  async function addAd(ad: (typeof ads)[number], index: number) {
    const adRows: (string | number)[][] = [];
    const folder = `${String(index + 1).padStart(2, "0")}-${exportFilename(ad.name)}`;
    const content = ad.content;
    const copy = exportAdCopy(content, campaign.landingUrl);
    const addRow = (
      size: string,
      card: number | string,
      file: string,
      words = copy,
    ) =>
      adRows.push([
        ad.id,
        ad.name,
        ad.status,
        size,
        card,
        words.headline,
        words.body,
        words.description,
        words.callToAction,
        words.linkUrl,
        file,
      ]);
    if ("headlines" in content) {
      addRow("text", "", "");
      return adRows;
    }
    const studio = content.ideaStudio;
    if (studio) {
      const shapes = studio.document.exportShapes ?? studio.document.shapes;
      if (!shapes.length || !studio.document.cards.length)
        throw new Error(
          `${ad.name}: choose export sizes and add artwork first`,
        );
      for (const shape of shapes) {
        for (const [cardIndex, card] of studio.document.cards.entries()) {
          const preview = ideaPreviewUrl(brand.id, card, shape);
          if (!preview)
            throw new Error(
              `${ad.name}: card ${cardIndex + 1} is missing ${shape} artwork`,
            );
          const approved =
            ad.status === "approved"
              ? studio.approval?.renders[shape]?.[cardIndex]
              : null;
          let bytes: Buffer;
          let extension = "png";
          if (approved) {
            const image = await fetchPublicImage(approved.url);
            bytes = image.body;
            extension =
              image.contentType === "image/jpeg"
                ? "jpg"
                : image.contentType.split("/")[1]!;
          } else {
            const url = new URL(preview, "http://local");
            const { parsed, sourceUrl, insetUrl } =
              compositionPreviewFromParams(url.searchParams);
            if (!parsed.success)
              throw new Error(`${ad.name}: invalid artwork recipe`);
            const context = await resolveCompositionContext(
              input.userId,
              parsed.data,
              { sourceUrl, insetUrl },
            );
            const loaded = await loadCompositionSource(context);
            bytes = Buffer.from(
              await renderComposition(parsed.data, loaded).arrayBuffer(),
            );
          }
          const file = `${folder}/${shape}/card-${String(cardIndex + 1).padStart(2, "0")}.${extension}`;
          zip.file(file, bytes);
          const variant = { ...copy, ...studio.document.copyOverrides[shape] };
          addRow(shape, cardIndex + 1, file, {
            ...variant,
            headline: card.copy?.headline ?? variant.headline,
            description: card.copy?.description ?? variant.description,
            linkUrl:
              card.copy?.landingUrl ||
              variant.linkUrl ||
              campaign.landingUrl ||
              "",
          });
        }
      }
    } else {
      if (!content.media.length)
        throw new Error(`${ad.name}: add artwork before downloading`);
      for (const [cardIndex, card] of content.media.entries()) {
        for (const [size, media] of [
          ["original", card],
          ...(card.story ? [["story", card.story] as const] : []),
        ] as const) {
          const mediaUrl = new URL(media.url, "http://local");
          let bytes: Buffer;
          let extension: string;
          if (mediaUrl.pathname === "/api/compositions/preview") {
            const { parsed, sourceUrl, insetUrl } =
              compositionPreviewFromParams(mediaUrl.searchParams);
            if (!parsed.success)
              throw new Error(`${ad.name}: invalid artwork recipe`);
            const context = await resolveCompositionContext(
              input.userId,
              parsed.data,
              { sourceUrl, insetUrl },
            );
            bytes = Buffer.from(
              await renderComposition(
                parsed.data,
                await loadCompositionSource(context),
              ).arrayBuffer(),
            );
            extension = "png";
          } else if (card.type === "video") {
            ({ bytes, extension } = await videoFile(media.url));
          } else {
            const image = await fetchPublicImage(media.url);
            bytes = image.body;
            extension =
              image.contentType === "image/jpeg"
                ? "jpg"
                : image.contentType.split("/")[1]!;
          }
          const file = `${folder}/${size}/card-${String(cardIndex + 1).padStart(2, "0")}.${extension}`;
          zip.file(file, bytes);
          addRow(size, cardIndex + 1, file, {
            ...copy,
            headline: card.headline ?? copy.headline,
            description: card.description ?? copy.description,
            linkUrl: card.landingUrl || copy.linkUrl,
          });
        }
      }
    }
    return adRows;
  }
  // Bound downloads while retaining the campaign's ad order in the copy sheet.
  for (let start = 0; start < ads.length; start += 4) {
    const sections = await Promise.all(
      ads.slice(start, start + 4).map((ad, index) => addAd(ad, start + index)),
    );
    for (const section of sections) rows.push(...section);
  }
  zip.file("ads.csv", adExportCsv(rows));
  return {
    filename: `${exportFilename(brand.slug ?? brand.name)}-${exportFilename(campaign.name)}-ads.zip`,
    body: Readable.toWeb(
      zip.generateNodeStream({ streamFiles: true }),
    ) as unknown as ReadableStream<Uint8Array>,
  };
}
