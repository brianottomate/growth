import Link from "next/link";
import { notFound, redirect } from "next/navigation";
// Subpath import on purpose: the package root re-exports a Mux-backed
// VideoPlayer, which drags in @mux/mux-player-react (a peer we don't install).
import { StructuredText } from "react-datocms/structured-text";

import { getSession } from "@/server/better-auth/server";
import {
  getBlogArticleDraft,
  isDatoCdaConfigured,
} from "@/server/clients/datocms-cda.client";
import { PreviewBlock } from "./PreviewBlocks";

// Draft preview for the growth team. Reads the CURRENT (draft) record from the
// DatoCMS Content Delivery API with X-Include-Drafts — the same API wander.com
// renders from — and renders it with react-datocms' <StructuredText>, the same
// component wander.com uses, so the preview and the site stay in step.
//
// This deliberately lives in growth rather than wander.com: the audience is the
// growth team, who are already here. A wander.com draft-mode route would only
// buy pixel-exact fidelity, and would cost a preview secret, a Dato plugin, and
// a production surface. Revisit if people outside growth need previews.
//
// An earlier version read the CMA and rendered to an HTML string, which meant
// hand-translating raw DAST into the renderer's shape and injecting it with
// dangerouslySetInnerHTML. The CDA returns { value, blocks } directly, so that
// translation layer is gone.

export const dynamic = "force-dynamic";

export default async function DatoPreviewReactPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const session = await getSession();
  if (!session?.user) redirect("/signin");
  if (!isDatoCdaConfigured) notFound();

  const { itemId } = await params;
  const article = await getBlogArticleDraft(itemId).catch(() => null);
  if (!article) notFound();

  const published = article._status === "published";
  const hero = article.image;

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
        <span className="rounded-full border px-2 py-0.5">
          react-datocms · CDA
        </span>
        <span>Rendered with the same tooling as wander.com.</span>
        {article.url && (
          <span className="font-mono">wander.com/article/{article.url}</span>
        )}
      </div>

      <article>
        {hero?.url && (
          // eslint-disable-next-line @next/next/no-img-element -- Dato CDN host isn't in next/image remotePatterns
          <img
            src={hero.url}
            alt={hero.alt ?? ""}
            className="mb-8 aspect-[2/1] w-full rounded-xl object-cover"
          />
        )}
        <h1 className="text-3xl font-semibold tracking-tight text-balance">
          {article.title ?? "Untitled"}
        </h1>
        {article.description && (
          <p className="text-muted-foreground mt-3 text-lg">
            {article.description}
          </p>
        )}
        <div className="prose prose-invert prose-neutral mt-8 max-w-none">
          <StructuredText
            data={article.body}
            renderBlock={({ record }) => <PreviewBlock block={record} />}
          />
        </div>
      </article>

      <div className="text-muted-foreground mt-10 flex gap-4 border-t pt-4 text-xs">
        <Link href="/app/content" className="hover:text-foreground underline">
          ← Back to content
        </Link>
      </div>
    </div>
  );
}
