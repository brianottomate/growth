"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Streamdown } from "streamdown";
import { MessageSquare, ArrowLeft, ImageIcon } from "lucide-react";
import { orpc } from "@/orpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BriefFields } from "@/components/editorial/BriefFields";
import { sendAssistantIntent } from "@/lib/assistant-events";
import type { CreativeDocument } from "@/lib/creative-document";

type Article = Extract<CreativeDocument, { type: "article" }>;
export function BlogWorkspace({
  documentId,
  platformPostId,
  brandName,
  initiative,
}: {
  documentId: string;
  platformPostId: string;
  brandName: string;
  initiative?: { id: string; name: string };
}) {
  const client = useQueryClient();
  const options = orpc.creativeWork.document.queryOptions({
    input: { documentId },
  });
  const query = useQuery({
    ...options,
    refetchInterval: (q) =>
      ["queued", "running"].includes(q.state.data?.run?.status ?? "")
        ? 2000
        : false,
  });
  const refresh = () =>
    client.invalidateQueries({ queryKey: options.queryKey });
  const [draft, setDraft] = useState<Article | null>(null);
  const [tab, setTab] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [choosingHero, setChoosingHero] = useState(false);
  const save = useMutation(
    orpc.creativeWork.saveDocument.mutationOptions({
      onSuccess: async () => {
        setDraft(null);
        await refresh();
      },
    }),
  );
  const produce = useMutation(
    orpc.creativeWork.produceDocument.mutationOptions({
      onSuccess: async () => {
        setTab("draft");
        await refresh();
      },
    }),
  );
  const push = useMutation(
    orpc.creativeWork.pushDato.mutationOptions({ onSuccess: refresh }),
  );
  const pull = useMutation(
    orpc.creativeWork.pullDato.mutationOptions({ onSuccess: refresh }),
  );
  const cancel = useMutation(
    orpc.creativeWork.cancelDocumentRun.mutationOptions({ onSuccess: refresh }),
  );
  useEffect(() => {
    const fn = () => void refresh();
    window.addEventListener("growth:write", fn);
    return () => window.removeEventListener("growth:write", fn);
  }, [documentId]); // oxlint-disable-line react/exhaustive-deps
  useEffect(() => {
    if (!draft) return;
    const fn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [draft]);
  if (!query.data)
    return (
      <p className="py-10 text-muted-foreground">
        {query.error?.message ?? "Loading blog workspace…"}
      </p>
    );
  const data = query.data;
  if (data.document.type !== "article")
    return <p>This is not an article document.</p>;
  const article = draft ?? data.document;
  const content = article.content;
  const hasBody = !!content.bodyMarkdown.trim();
  const activeTab = tab ?? (hasBody ? "draft" : "brief");
  const running = ["queued", "running"].includes(data.run?.status ?? "");
  const busy =
    running ||
    save.isPending ||
    produce.isPending ||
    pull.isPending ||
    push.isPending;
  const hero = data.assets.find((a) => a.id === content.heroAssetId);
  const error =
    save.error ?? produce.error ?? pull.error ?? push.error ?? cancel.error;
  const updateContent = (patch: Partial<Article["content"]>) =>
    setDraft({ ...article, content: { ...content, ...patch } });
  const chat = () =>
    sendAssistantIntent({
      type: "work_content_post",
      brandId: data.brandId,
      brandName,
      contentPostId: data.contentPostId ?? "",
      contentTitle: content.title,
      platformPostId,
      platform: "blog",
      visibleText: `Help me refine this blog's ${activeTab === "brief" ? "brief" : "draft"}: “${content.title}”. Read its selected article document (${documentId}) first. Keep edits on that document. Do not create another document or push to Dato unless I ask.`,
    });
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <Link
          className="inline-flex items-center gap-1 hover:text-foreground"
          href={initiative ? `/app/initiatives/${initiative.id}` : "/app/blog"}
        >
          <ArrowLeft className="size-4" />
          {initiative?.name ?? "Blog"}
        </Link>
        {data.contentPostId && (
          <Link
            className="ml-auto hover:text-foreground"
            href={`/app/content/${data.contentPostId}?card=1`}
          >
            Content item
          </Link>
        )}
      </div>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs text-muted-foreground">
            {brandName} · Blog · {hasBody ? "Draft" : "Brief"}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {content.title || data.title}
          </h1>
        </div>
        <Button variant="outline" onClick={chat}>
          <MessageSquare />
          Work in chat
        </Button>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <Tabs value={activeTab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="draft">Draft</TabsTrigger>
            <TabsTrigger value="brief">Brief</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap gap-2">
          {draft && (
            <Button
              disabled={busy}
              onClick={() => save.mutate({ documentId, document: article })}
            >
              Save {activeTab === "brief" ? "brief" : "changes"}
            </Button>
          )}
          <Button
            disabled={busy || !!draft}
            onClick={() => produce.mutate({ documentId })}
          >
            {hasBody ? "Regenerate from brief" : "Write from brief"}
          </Button>
          {running &&
            data.run &&
            !["pull", "push"].includes(data.run.operation) && (
              <Button
                variant="outline"
                onClick={() => cancel.mutate({ runId: data.run!.id })}
              >
                Cancel
              </Button>
            )}
        </div>
      </div>
      {draft && (
        <p className="text-sm text-muted-foreground">
          Unsaved changes. Save before generating or transferring to Dato.
        </p>
      )}
      {busy && (
        <p role="status" className="text-sm text-muted-foreground">
          {running
            ? "Working on your article. Editing is locked until this finishes."
            : "Saving…"}
        </p>
      )}
      {(error || data.run?.error) && (
        <p role="alert" className="rounded-lg border p-3 text-sm">
          {error?.message ?? data.run?.error}
        </p>
      )}
      <fieldset
        disabled={busy}
        inert={busy}
        className="min-w-0 disabled:opacity-60"
      >
        {activeTab === "brief" ? (
          <section className="rounded-xl border bg-card p-5 @2xl:p-6">
            <h2 className="text-lg font-medium">Article brief</h2>
            <p className="mt-1 mb-6 text-sm text-muted-foreground">
              Shape the direction here or in chat. Saving the brief leaves the
              draft unchanged; writing from it replaces the current draft.
            </p>
            <BriefFields
              brief={article.brief}
              onChange={(brief) => setDraft({ ...article, brief })}
            />
          </section>
        ) : (
          <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-[minmax(0,1fr)_280px]">
            <section className="min-w-0 rounded-xl border bg-card p-5 @2xl:p-8">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="font-medium">Article</h2>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditing(!editing)}
                >
                  {editing ? "Preview" : "Edit text"}
                </Button>
              </div>
              {editing ? (
                <div className="space-y-4">
                  <label className="block space-y-2 text-sm">
                    Title
                    <Input
                      value={content.title}
                      onChange={(e) => updateContent({ title: e.target.value })}
                    />
                  </label>
                  <label className="block space-y-2 text-sm">
                    Description
                    <Textarea
                      value={content.description}
                      onChange={(e) =>
                        updateContent({ description: e.target.value })
                      }
                    />
                  </label>
                  <label className="block space-y-2 text-sm">
                    Article Markdown
                    <Textarea
                      className="min-h-[32rem]"
                      value={content.bodyMarkdown}
                      onChange={(e) =>
                        updateContent({ bodyMarkdown: e.target.value })
                      }
                    />
                  </label>
                </div>
              ) : hasBody ? (
                <article className="space-y-5">
                  {hero?.url && (
                    <img
                      src={hero.url}
                      alt={hero.title ?? ""}
                      className="aspect-[2/1] w-full rounded-lg object-cover"
                    />
                  )}
                  <h2 className="text-3xl font-semibold tracking-tight">
                    {content.title}
                  </h2>
                  <p className="text-muted-foreground">{content.description}</p>
                  <div className="article-prose prose max-w-none">
                    <Streamdown mode="static">
                      {content.bodyMarkdown}
                    </Streamdown>
                  </div>
                </article>
              ) : (
                <div className="space-y-3 py-16 text-center">
                  <h3 className="text-xl font-medium">
                    Your article starts with the brief
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Review the direction, then choose Write from brief.
                  </p>
                  <Button variant="outline" onClick={() => setTab("brief")}>
                    Review brief
                  </Button>
                </div>
              )}
              {content.review && (
                <details className="mt-6 rounded-lg border p-4">
                  <summary className="cursor-pointer text-sm font-medium">
                    Editorial review ·{" "}
                    {content.review.verdict.replaceAll("_", " ")}
                  </summary>
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {content.review.findings.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
            <aside className="space-y-4">
              <section className="space-y-3 rounded-xl border bg-card p-4">
                <h2 className="text-sm font-medium">Hero image</h2>
                {hero?.url ? (
                  <img
                    src={hero.url}
                    alt={hero.title ?? ""}
                    className="aspect-[2/1] w-full rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex aspect-[2/1] items-center justify-center rounded-lg bg-muted">
                    <ImageIcon className="size-7 text-muted-foreground" />
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setChoosingHero(!choosingHero)}
                >
                  {hero ? "Change image" : "Choose image"}
                </Button>
                {hero && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => updateContent({ heroAssetId: undefined })}
                  >
                    Remove
                  </Button>
                )}
                {choosingHero && (
                  <div className="grid max-h-96 grid-cols-2 gap-2 overflow-y-auto">
                    {data.assets
                      .filter((a) => a.url)
                      .map((asset) => (
                        <button
                          key={asset.id}
                          className="overflow-hidden rounded-md border text-left hover:ring-2 hover:ring-ring"
                          onClick={() => {
                            updateContent({ heroAssetId: asset.id });
                            setChoosingHero(false);
                          }}
                        >
                          <img
                            src={asset.url!}
                            alt={asset.title ?? "Library image"}
                            className="aspect-square w-full object-cover"
                          />
                          <span className="block truncate p-1 text-xs">
                            {asset.title ?? "Library image"}
                          </span>
                        </button>
                      ))}
                  </div>
                )}
              </section>
              <section className="space-y-3 rounded-xl border bg-card p-4">
                <h2 className="text-sm font-medium">Article settings</h2>
                <label className="block space-y-1 text-xs">
                  URL slug
                  <Input
                    value={content.slug}
                    onChange={(e) => updateContent({ slug: e.target.value })}
                  />
                </label>
                <label className="block space-y-1 text-xs">
                  Author
                  <Input
                    value={content.authorName}
                    onChange={(e) =>
                      updateContent({ authorName: e.target.value })
                    }
                  />
                </label>
              </section>
              <section className="space-y-3 rounded-xl border bg-card p-4">
                <h2 className="text-sm font-medium">Dato draft</h2>
                <p className="text-xs text-muted-foreground">
                  {content.datoItemId
                    ? "Connected to a CMS article. Transfers overwrite the destination draft."
                    : "Not yet sent to Dato. A hero image is required for the first export."}{" "}
                  Publishing is a separate step in Dato.
                </p>
                <Button
                  size="sm"
                  disabled={!!draft || !hasBody}
                  onClick={() => push.mutate({ documentId })}
                >
                  Push draft to Dato
                </Button>
                {content.datoItemId && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!!draft}
                    onClick={() => pull.mutate({ documentId })}
                  >
                    Replace from Dato
                  </Button>
                )}
              </section>
            </aside>
          </div>
        )}
      </fieldset>
    </div>
  );
}
