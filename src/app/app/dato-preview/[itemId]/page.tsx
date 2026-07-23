import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { render } from "datocms-structured-text-to-html-string";

import { getSession } from "@/server/better-auth/server";
import {
  getItem,
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

/** Structured text → HTML, degrading gracefully on embeds our drafts never
 * contain (blocks, inline records) instead of throwing. */
function bodyToHtml(body: unknown): string | null {
  try {
    return render(body as Parameters<typeof render>[0], {
      renderBlock: () => "",
      renderInlineRecord: () => "",
      renderLinkToRecord: ({ children }) =>
        Array.isArray(children) ? children.join("") : (children ?? ""),
    });
  } catch {
    return null;
  }
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
  const heroUrl = heroUploadId ? await getUploadUrl(heroUploadId) : null;
  const html = bodyToHtml(attrs.body);
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

      <div className="text-muted-foreground mt-10 border-t pt-4 text-xs">
        <Link href="/app/content" className="hover:text-foreground underline">
          ← Back to content
        </Link>
      </div>
    </div>
  );
}
