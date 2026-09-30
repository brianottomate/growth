"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ExternalLink,
  Loader2,
  MessageSquare,
  Pencil,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
} from "lucide-react";

import { SimpleDialog } from "@/components/ui/dialog";
import { sendAssistantIntent } from "@/lib/assistant-events";
import { orpc, type RouterOutputs } from "@/orpc/client";
import { EmailBlocksCard } from "./EmailBlocksCard";
import { previewBody } from "./email-blocks";
import { DigestImageBoard } from "./DigestImageBoard";
import { EmailPreviewFrame, type PreviewPick } from "./EmailPreviewFrame";
import { FindHomesCard } from "./FindHomesCard";

type Workspace = RouterOutputs["newsletter"]["workspace"];
type Draft = Pick<
  Workspace["document"],
  | "subject"
  | "preheader"
  | "bodyMarkdown"
  | "ctaLabel"
  | "ctaUrl"
  | "templateKey"
  | "handoffTargetRepo"
  | "productUpdate"
  // Part of the draft so photo choices save with the subject and body, rather
  // than through a separate write that could disagree with what is on screen.
  | "digest"
>;

const controlClass =
  "bg-background border-input focus:ring-ring/30 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2";

function Editor({ workspace }: { workspace: Workspace }) {
  const queryClient = useQueryClient();
  const queryKey = orpc.newsletter.workspace.queryKey({
    input: {
      platformPostId: workspace.spot.id,
    },
  });
  const [draft, setDraft] = useState<Draft>({
    subject: workspace.document.subject,
    preheader: workspace.document.preheader,
    bodyMarkdown: workspace.document.bodyMarkdown,
    ctaLabel: workspace.document.ctaLabel,
    ctaUrl: workspace.document.ctaUrl,
    templateKey: workspace.document.templateKey,
    handoffTargetRepo: workspace.document.handoffTargetRepo,
    productUpdate: workspace.document.productUpdate,
    digest: workspace.document.digest,
  });
  const [brief, setBrief] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [previewWarnings, setPreviewWarnings] = useState<string[]>([]);
  // template = raw liquid as CIO receives it; the personas simulate CIO's
  // per-recipient expansion. "sparse" is the fallback-shaker: a recipient with
  // no attributes at all.
  const [viewAs, setViewAs] = useState<"template" | "full" | "sparse">(
    "template",
  );

  const refreshWorkspace = async () => {
    await queryClient.invalidateQueries({ queryKey });
  };
  const save = useMutation(
    orpc.newsletter.saveDocument.mutationOptions({
      onSuccess: refreshWorkspace,
    }),
  );
  const generate = useMutation(
    orpc.newsletter.generateDraft.mutationOptions({
      onSuccess: refreshWorkspace,
    }),
  );
  const restore = useMutation(
    orpc.newsletter.restoreVersion.mutationOptions({
      onSuccess: refreshWorkspace,
    }),
  );
  const preview = useMutation(
    orpc.newsletter.renderPreview.mutationOptions({
      onSuccess: ({ html, warnings }) => {
        setPreviewHtml(html);
        setPreviewWarnings(warnings ?? []);
      },
    }),
  );

  // Every preview carries the editor's block ids, so a click in it opens
  // that block; the saved draft never does.
  const previewDraft = (
    next: Draft = draft,
    as: "template" | "full" | "sparse" = viewAs,
  ) =>
    preview.mutate({
      platformPostId: workspace.spot.id,
      draft: { ...next, bodyMarkdown: previewBody(next.bodyMarkdown) },
      viewAs: as,
      blockIds: true,
    });
  const renderPreview = (as: "template" | "full" | "sparse" = viewAs) =>
    previewDraft(draft, as);
  const [activePick, setActivePick] = useState<PreviewPick | null>(null);
  const [previewSelect, setPreviewSelect] = useState<{
    pick: PreviewPick;
    nonce: number;
  } | null>(null);

  useEffect(() => {
    previewDraft();
    // Generate the initial projection once per persisted revision. Subsequent
    // unsaved changes are rendered explicitly so typing never causes requests.
    // oxlint-disable-next-line react/exhaustive-deps
  }, [workspace.document.currentRevision]);

  const activeJob =
    workspace.latestJob?.status === "queued" ||
    workspace.latestJob?.status === "running";
  const formatLabel =
    workspace.spot.format === "newsletter.blast"
      ? "One-off blast"
      : "Newsletter issue";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full bg-muted px-2 py-1 font-medium">
              {formatLabel}
            </span>
            <span>{workspace.spot.status.replaceAll("_", " ")}</span>
            {workspace.content?.plannedAt && (
              <span>
                · Content calendar{" "}
                {workspace.content.plannedAt.toLocaleString()}
              </span>
            )}
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            {workspace.content?.title || draft.subject || "Untitled email"}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              sendAssistantIntent({
                type: "work_content_post",
                brandId: workspace.brand.id,
                brandName: workspace.brand.name,
                contentPostId: workspace.content?.id ?? "",
                contentTitle:
                  workspace.content?.title || draft.subject || "this email",
                platformPostId: workspace.spot.id,
                platform: "newsletter",
                visibleText: `Help me work through the ${formatLabel.toLowerCase()} “${workspace.content?.title || draft.subject || "Untitled"}”. Read the email draft first, then help me refine it.`,
              })
            }
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <MessageSquare className="size-4" /> Work in chat
          </button>
          <Link
            href={
              workspace.content
                ? // ?card=1 bypasses the email-only redirect on the content
                  // page, or this link would bounce straight back here.
                  `/app/content/${workspace.content.id}?card=1`
                : "/app/content"
            }
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            Content item <ExternalLink className="size-3.5" />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 @5xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)]">
        <div className="space-y-4">
          {/* Chat-first: the conversation is the write path for words (subject,
              intro, CTA); the one clicky exception is photos, because picking
              an image is a recognition task a grid does better than prose. The
              form fields survive below as a collapsed escape hatch. */}
          {/* The empty state of a Wander issue: no homes and no words yet.
              wander.com homes only exist for the Wander brand. */}
          {!draft.digest &&
            !draft.bodyMarkdown.trim() &&
            workspace.brand.slug === "wander" && (
              <FindHomesCard
                title={workspace.content?.title || draft.subject || "Untitled"}
                hook={workspace.content?.hook}
                purpose={workspace.content?.purpose}
                sendDate={workspace.content?.plannedAt}
              />
            )}
          <EmailBlocksCard
            // A saved, restored or generated revision replaces the body; the
            // blocks re-read it.
            key={workspace.document.currentRevision}
            platformPostId={workspace.spot.id}
            brandId={workspace.brand.id}
            campaign={workspace.content?.title || draft.subject}
            canAddHomes={workspace.brand.homeCount > 0}
            fields={{
              subject: draft.subject,
              preheader: draft.preheader,
              bodyMarkdown: draft.bodyMarkdown,
              ctaLabel: draft.ctaLabel,
              ctaUrl: draft.ctaUrl,
              templateKey: draft.templateKey,
              digest: draft.digest,
            }}
            select={previewSelect}
            onOpenChange={setActivePick}
            onChange={(change) => {
              const next = { ...draft, ...change };
              setDraft(next);
              previewDraft(next);
            }}
          />
          {/* Wander's issues match their homes to wander.com; a brand's own
              homes are edited in their blocks above. */}
          {draft.digest && workspace.brand.slug === "wander" && (
            <DigestImageBoard
              digest={draft.digest}
              intro={draft.bodyMarkdown}
              campaign={workspace.content?.title || draft.subject}
              brandId={workspace.brand.id}
              wanderMarketplace={workspace.brand.slug === "wander"}
              onChange={(digest) => setDraft({ ...draft, digest })}
            />
          )}

          <section className="rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  save.mutate({
                    platformPostId: workspace.spot.id,
                    changes: draft,
                    note: "Saved from the newsletter workspace",
                  })
                }
                disabled={save.isPending}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {save.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Save revision
              </button>
              <button
                type="button"
                onClick={() => renderPreview()}
                disabled={preview.isPending}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
              >
                <RefreshCw
                  className={`size-4 ${preview.isPending ? "animate-spin" : ""}`}
                />
                Refresh preview
              </button>
              <button
                type="button"
                onClick={() => setFieldsOpen(true)}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
              >
                <Pencil className="size-4" /> Edit fields manually
              </button>
              <span className="text-xs text-muted-foreground">
                Revision {workspace.document.currentRevision}
              </span>
            </div>
            {(save.error || preview.error) && (
              <p className="mt-2 text-sm text-red-500">
                {(save.error ?? preview.error)?.message}
              </p>
            )}
          </section>

          {fieldsOpen && (
            <ManualFieldsDialog
              initial={{
                subject: draft.subject,
                preheader: draft.preheader,
                bodyMarkdown: draft.bodyMarkdown,
                ctaLabel: draft.ctaLabel,
                ctaUrl: draft.ctaUrl,
              }}
              isDigest={Boolean(draft.digest)}
              saving={save.isPending}
              onSave={(fields) => {
                const next = { ...draft, ...fields };
                setDraft(next);
                save.mutate(
                  {
                    platformPostId: workspace.spot.id,
                    changes: next,
                    note: "Edited fields manually",
                  },
                  { onSuccess: () => setFieldsOpen(false) },
                );
              }}
              onOpenChange={setFieldsOpen}
            />
          )}

          {draft.productUpdate && (
            <section className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-semibold">Verified product evidence</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Customer-facing claims are grounded in these exact changes.
                    Only release-verified evidence can enter delivery.
                  </p>
                </div>
                <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium">
                  {new Date(
                    draft.productUpdate.periodStart,
                  ).toLocaleDateString()}
                  –
                  {new Date(draft.productUpdate.periodEnd).toLocaleDateString()}
                </span>
              </div>
              <div className="mt-3 divide-y">
                {draft.productUpdate.changes.map((change) => (
                  <div
                    key={`${change.repository}:${change.ref}`}
                    className="py-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold uppercase">
                        {change.category}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${
                          change.releaseStatus === "shipped"
                            ? "bg-emerald-500/10 text-emerald-700"
                            : "bg-amber-500/10 text-amber-700"
                        }`}
                      >
                        {change.releaseStatus}
                      </span>
                      <span className="font-medium">{change.title}</span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {change.summary}
                    </p>
                    {change.customerImpact && (
                      <p className="mt-1 text-xs">
                        Customer impact: {change.customerImpact}
                      </p>
                    )}
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                      {change.url ? (
                        <a
                          href={change.url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2 hover:text-foreground"
                        >
                          {change.repository}@{change.ref}
                        </a>
                      ) : (
                        <>
                          {change.repository}@{change.ref}
                        </>
                      )}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4" />
              <h2 className="font-semibold">Generate this selected issue</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Uses this slot’s premise, pillar or series, brand voice, and the
              current draft. It does not generate any neighboring slots.
            </p>
            <textarea
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              className={`${controlClass} mt-3 min-h-24`}
              placeholder="Optional refinement: make the opening more personal, keep the launch details concrete…"
            />
            <button
              type="button"
              onClick={() =>
                generate.mutate({
                  platformPostId: workspace.spot.id,
                  brief: brief.trim() || undefined,
                })
              }
              disabled={generate.isPending || activeJob}
              className="mt-2 flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {generate.isPending || activeJob ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {activeJob
                ? "Generation in progress"
                : workspace.document.currentRevision
                  ? "Generate refinement"
                  : "Generate first draft"}
            </button>
            {workspace.latestJob?.status === "failed" && (
              <p className="mt-2 text-sm text-red-500">
                {workspace.latestJob.error || "Generation failed."}
              </p>
            )}
          </section>

          {workspace.versions.length > 0 && (
            <section className="rounded-xl border bg-card p-4">
              <h2 className="font-semibold">Revision history</h2>
              <div className="mt-3 divide-y">
                {workspace.versions.map((version) => (
                  <div
                    key={version.id}
                    className="flex items-center justify-between gap-3 py-2 text-sm"
                  >
                    <div>
                      <span className="font-medium">
                        Revision {version.revision}
                      </span>
                      <span className="ml-2 text-muted-foreground">
                        {version.source} · {version.createdAt.toLocaleString()}
                      </span>
                      {version.note && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {version.note}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        restore.mutate({
                          platformPostId: workspace.spot.id,
                          versionId: version.id,
                        })
                      }
                      disabled={restore.isPending}
                      className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
                    >
                      <RotateCcw className="size-3.5" /> Restore
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="@5xl:sticky @5xl:top-4 @5xl:self-start">
          <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-slate-50 px-4 py-2.5 text-xs font-medium text-slate-600">
              <span>Email preview</span>
              {/* Per-guest fields stay as written in the stored document and
                  are filled for each guest at send time. */}
              <div className="flex overflow-hidden rounded-md border border-slate-200">
                {(
                  [
                    ["template", "As written"],
                    ["full", "Sample guest"],
                    ["sparse", "No guest data"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setViewAs(value);
                      renderPreview(value);
                    }}
                    className={`px-2 py-1 text-[11px] font-medium ${
                      viewAs === value
                        ? "bg-slate-800 text-white"
                        : "bg-white text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {previewWarnings.length > 0 && (
              <div className="space-y-1 border-b border-amber-200 bg-amber-50 px-4 py-2">
                {previewWarnings.map((warning) => (
                  <p key={warning} className="text-xs text-amber-800">
                    {warning}
                  </p>
                ))}
              </div>
            )}
            {previewHtml ? (
              <EmailPreviewFrame
                html={previewHtml}
                active={activePick}
                onPick={(pick) =>
                  setPreviewSelect((current) => ({
                    pick,
                    nonce: (current?.nonce ?? 0) + 1,
                  }))
                }
              />
            ) : (
              <div className="flex h-[560px] items-center justify-center text-sm text-slate-500">
                {preview.isPending
                  ? "Rendering preview…"
                  : "Preview unavailable"}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

type ManualFields = Pick<
  Draft,
  "subject" | "preheader" | "bodyMarkdown" | "ctaLabel" | "ctaUrl"
>;

/**
 * Manual field editing lives in a modal on purpose. As an inline form it was a
 * second writer racing the chat, and the content-post editor taught us how
 * that ends: chat moves the document under the form and someone's work loses.
 * The dialog makes the mode explicit. While it is open you are editing a local
 * copy, chat is out of reach, and nothing exists until Save.
 */
function ManualFieldsDialog({
  initial,
  isDigest,
  saving,
  onSave,
  onOpenChange,
}: {
  initial: ManualFields;
  isDigest: boolean;
  saving: boolean;
  onSave: (fields: ManualFields) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [fields, setFields] = useState<ManualFields>(initial);
  const dirty = JSON.stringify(fields) !== JSON.stringify(initial);
  const close = (next: boolean) => {
    if (next) return;
    if (
      dirty &&
      !saving &&
      !window.confirm("Discard your unsaved field edits?")
    )
      return;
    onOpenChange(false);
  };

  return (
    <SimpleDialog
      open
      onOpenChange={close}
      title="Edit fields manually"
      description="You are editing a local copy. Nothing applies until you save, and chat edits wait until you close this."
      size="lg"
      scrollable
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => close(false)}
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={() => onSave(fields)}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Save revision
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-3 @xl:grid-cols-2">
        <label className="@xl:col-span-2">
          <span className="mb-1 block text-xs font-medium">Subject</span>
          <input
            value={fields.subject}
            onChange={(event) =>
              setFields({ ...fields, subject: event.target.value })
            }
            className={controlClass}
          />
        </label>
        <label className="@xl:col-span-2">
          <span className="mb-1 block text-xs font-medium">Preheader</span>
          <input
            value={fields.preheader ?? ""}
            onChange={(event) =>
              setFields({ ...fields, preheader: event.target.value || null })
            }
            className={controlClass}
            placeholder="Optional inbox preview text"
          />
        </label>
        <label className="@xl:col-span-2">
          <span className="mb-1 block text-xs font-medium">
            {isDigest
              ? "Intro copy · shown above the homes"
              : "Email body · Markdown"}
          </span>
          <textarea
            value={fields.bodyMarkdown}
            onChange={(event) =>
              setFields({ ...fields, bodyMarkdown: event.target.value })
            }
            className={`${controlClass} ${isDigest ? "min-h-[160px]" : "min-h-[380px]"} font-mono text-[13px] leading-6`}
            placeholder={
              isDigest
                ? "A short greeting and one or two paragraphs. The homes below render from the digest, not from this text. Supports **bold** and [links](https://…)."
                : "Write the email here, or generate this selected slot from its brief."
            }
          />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium">CTA label</span>
          <input
            value={fields.ctaLabel ?? ""}
            onChange={(event) =>
              setFields({ ...fields, ctaLabel: event.target.value || null })
            }
            className={controlClass}
          />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium">CTA URL</span>
          <input
            value={fields.ctaUrl ?? ""}
            onChange={(event) =>
              setFields({ ...fields, ctaUrl: event.target.value || null })
            }
            className={controlClass}
            placeholder="https://…"
          />
        </label>
      </div>
    </SimpleDialog>
  );
}

export function NewsletterIssueWorkspace({
  platformPostId,
}: {
  platformPostId: string;
}) {
  const query = useQuery({
    ...orpc.newsletter.workspace.queryOptions({ input: { platformPostId } }),
    refetchInterval: (result) => {
      const status = result.state.data?.latestJob?.status;
      return status === "queued" || status === "running" ? 2_000 : false;
    },
  });

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading email workspace…
      </div>
    );
  }
  if (query.error || !query.data) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-5 text-sm text-red-600">
        {query.error?.message || "Could not load the email workspace."}
      </div>
    );
  }

  return (
    <Editor
      key={`${query.data.document.id}:${query.data.document.currentRevision}`}
      workspace={query.data}
    />
  );
}
