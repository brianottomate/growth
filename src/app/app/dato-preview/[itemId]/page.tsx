import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { render } from "datocms-structured-text-to-html-string";

import { getSession } from "@/server/better-auth/server";
import {
  getItem,
  getItemTypeMap,
  getUploadUrl,
  isDatoCmsConfigured,
} from "@/server/clients/datocms.client";

// Rendered preview of a DatoCMS blog draft. wander.com only renders
// PUBLISHED items and Dato has no Web Previews plugin installed, so until
// the site grows a draft-mode route this page is the way to proofread a
// draft as an article instead of as form fields. Approximate styling, same
// content: it reads the CURRENT item version straight from the CMA.

export const dynamic = "force-dynamic";

type UploadRef = { upload_id?: string } | null;

/** A nested block node as the CMA returns it with `nested=true`. */
type BlockNode = {
  item?: {
    id?: string;
    attributes?: Record<string, unknown>;
    relationships?: { item_type?: { data?: { id?: string } } };
  };
};

// Mirrors wander.com's BlogVideoEmbed: resolve the provider from the stored
// URL. Keep these regexes in sync with
// src/app/(blog)/.../BlogVideoEmbed.tsx in the wander.com repo.
const YOUTUBE_ID =
  /(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=|shorts\/)|youtu\.be\/)([\w-]{11})/;
const CLOUDFLARE_UID =
  /(?:cloudflarestream\.com|videodelivery\.net)\/([\w-]{20,})/;
const CLOUDFLARE_CUSTOMER = "qmayhafe7iottqnh";

const FRAME_STYLE =
  "width:100%;aspect-ratio:16/9;border-radius:0.75rem;overflow:hidden;margin:2rem 0;background:#1c1c1c";
const IFRAME_STYLE = "width:100%;height:100%;border:0";

/** Player src for a stored video URL, or null if we don't recognize it. */
function videoSrc(url: string): string | null {
  const yt = YOUTUBE_ID.exec(url)?.[1];
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt}`;
  const cf = CLOUDFLARE_UID.exec(url)?.[1];
  if (cf)
    return `https://customer-${CLOUDFLARE_CUSTOMER}.cloudflarestream.com/${cf}/iframe`;
  return null;
}

/**
 * The CMA returns structured text as raw DAST with blocks inlined as
 * `{ type: "block", item: {...} }`. The renderer instead expects the GraphQL
 * shape: `{ value, blocks: [...] }` with block nodes referencing block ids.
 * Without this translation the renderer throws on the first block, which is
 * why an earlier version of this page silently dropped them.
 */
function toGraphQLShape(body: unknown, modelOf: Record<string, string>) {
  const doc = (body as { document?: { children?: unknown[] } })?.document;
  const blocks: Array<Record<string, unknown>> = [];
  const children = (doc?.children ?? []).map((child) => {
    const node = child as { type?: string } & BlockNode;
    if (node.type !== "block" || !node.item) return child;
    const typeId = node.item.relationships?.item_type?.data?.id ?? "";
    blocks.push({
      id: node.item.id,
      __typename: modelOf[typeId] ?? "unknown",
      ...node.item.attributes,
    });
    return { type: "block", item: node.item.id };
  });
  return {
    value: { schema: "dast", document: { type: "root", children } },
    blocks,
  };
}

/**
 * Structured text → HTML. Blocks render by their MODEL api_key so the preview
 * shows what the article will actually contain (video, images) rather than
 * silently dropping them. Unknown models degrade to a visible note instead of
 * vanishing — a preview that hides content is worse than one that admits it
 * doesn't know how to draw it. Nodes are built through the renderer's adapter
 * so markup isn't escaped.
 */
function bodyToHtml(
  body: unknown,
  modelOf: Record<string, string>,
  uploadUrls: Record<string, string>,
): string | null {
  try {
    const data = toGraphQLShape(body, modelOf);
    return render(data as Parameters<typeof render>[0], {
      renderBlock: ({ record, adapter: { renderNode } }) => {
        const model = String(record.__typename ?? "");

        if (model === "video_embed") {
          const url = typeof record.url === "string" ? record.url : "";
          const src = url ? videoSrc(url) : null;
          if (!src) {
            return renderNode(
              "p",
              {},
              renderNode("em", {}, `Unrecognized video URL: ${url}`),
            );
          }
          return renderNode(
            "div",
            { style: FRAME_STYLE },
            renderNode("iframe", {
              src,
              style: IFRAME_STYLE,
              loading: "lazy",
              allowfullscreen: "true",
              title: "Video player",
            }),
          );
        }

        if (model === "blog_image") {
          const uploadId = (record.image as UploadRef)?.upload_id;
          const src = uploadId ? uploadUrls[uploadId] : undefined;
          if (!src) return null;
          return renderNode("img", {
            src,
            alt: "",
            style: "width:100%;border-radius:0.75rem;margin:2rem 0",
          });
        }

        return renderNode(
          "p",
          {},
          renderNode("em", {}, `[${model} — not rendered in preview]`),
        );
      },
      renderInlineRecord: () => null,
      renderLinkToRecord: ({ children }) =>
        Array.isArray(children) ? children.join("") : (children ?? null),
    });
  } catch {
    return null;
  }
}

/** Upload ids referenced by image blocks, so we can resolve their URLs. */
function imageUploadIds(
  body: unknown,
  modelOf: Record<string, string>,
): string[] {
  const doc = (body as { document?: { children?: BlockNode[] } })?.document;
  const ids: string[] = [];
  for (const child of doc?.children ?? []) {
    const typeId = child.item?.relationships?.item_type?.data?.id ?? "";
    if (modelOf[typeId] !== "blog_image") continue;
    const uploadId = (child.item?.attributes?.image as UploadRef)?.upload_id;
    if (uploadId) ids.push(uploadId);
  }
  return ids;
}

export default async function DatoPreviewPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const session = await getSession();
  if (!session?.user) redirect("/signin");
  if (!isDatoCmsConfigured) notFound();

  const { itemId } = await params;
  const item = await getItem(itemId).catch(() => null);
  if (!item) notFound();

  const attrs = item.attributes;
  const title = typeof attrs.title === "string" ? attrs.title : "Untitled";
  const description =
    typeof attrs.description === "string" ? attrs.description : null;
  const slug = typeof attrs.url === "string" ? attrs.url : null;
  const heroUploadId = (attrs.image as UploadRef)?.upload_id;
  const modelOf = await getItemTypeMap().catch(() => ({}));
  const [heroUrl, inlineUploads] = await Promise.all([
    heroUploadId ? getUploadUrl(heroUploadId) : Promise.resolve(null),
    Promise.all(
      imageUploadIds(attrs.body, modelOf).map(async (id) => {
        const url = await getUploadUrl(id);
        return [id, url] as const;
      }),
    ),
  ]);
  const uploadUrls = Object.fromEntries(
    inlineUploads.filter((pair): pair is readonly [string, string] => !!pair[1]),
  );
  const html = bodyToHtml(attrs.body, modelOf, uploadUrls);
  const published = item.meta.status === "published";

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="text-muted-foreground mb-8 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span
          className={`rounded-full px-2 py-0.5 font-medium ${
            published
              ? "bg-emerald-500/15 text-emerald-300"
              : "bg-amber-500/15 text-amber-300"
          }`}
        >
          {published ? "Published in Dato" : "Dato draft — not public"}
        </span>
        <span>
          Preview rendered from DatoCMS. Styling is approximate; content is
          exact.
        </span>
        {slug && (
          <span className="font-mono">wander.com/article/{slug}</span>
        )}
      </div>

      <article>
        {heroUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- Dato CDN host is not in next/image remotePatterns; a preview page doesn't need optimization
          <img
            src={heroUrl}
            alt=""
            className="mb-8 aspect-[2/1] w-full rounded-xl object-cover"
          />
        )}
        <h1 className="text-3xl font-semibold tracking-tight text-balance">
          {title}
        </h1>
        {description && (
          <p className="text-muted-foreground mt-3 text-lg">{description}</p>
        )}
        {html ? (
          <div
            className="prose prose-invert prose-neutral mt-8 max-w-none"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <p className="text-muted-foreground mt-8 text-sm">
            The body could not be rendered (it may contain embeds this preview
            does not support). Read it in the Dato editor instead.
          </p>
        )}
      </article>

      <div className="text-muted-foreground mt-10 flex gap-4 border-t pt-4 text-xs">
        <Link href="/app/content" className="hover:text-foreground underline">
          ← Back to content
        </Link>
        <Link
          href={`/app/dato-preview-react/${itemId}`}
          className="hover:text-foreground underline"
        >
          Compare with the react-datocms preview →
        </Link>
      </div>
    </div>
  );
}
