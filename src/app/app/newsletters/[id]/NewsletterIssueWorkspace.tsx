"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Clipboard,
  ExternalLink,
  Loader2,
  MailCheck,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { sendAssistantIntent } from "@/lib/assistant-events";
import { useTRPC, type RouterOutputs } from "@/trpc/react";

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
>;

const controlClass =
  "bg-background border-input focus:ring-ring/30 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2";

function Editor({ workspace }: { workspace: Workspace }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const queryKey = trpc.newsletter.workspace.queryKey({
    platformPostId: workspace.spot.id,
  });
  const [draft, setDraft] = useState<Draft>({
    subject: workspace.document.subject,
    preheader: workspace.document.preheader,
    bodyMarkdown: workspace.document.bodyMarkdown,
    ctaLabel: workspace.document.ctaLabel,
    ctaUrl: workspace.document.ctaUrl,
    templateKey: workspace.document.templateKey,
    handoffTargetRepo: workspace.document.handoffTargetRepo,
  });
  const [brief, setBrief] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");
  const [copied, setCopied] = useState(false);
  const [providerBroadcastId, setProviderBroadcastId] = useState("");
  const [segmentId, setSegmentId] = useState("");
  const [audienceLabel, setAudienceLabel] = useState("Live WanderOS customers");
  const [audienceKind, setAudienceKind] = useState<
    "wanderos_operators" | "guests" | "subscribers"
  >("wanderos_operators");
  const [sendConfirmation, setSendConfirmation] = useState("");

  const refreshWorkspace = async () => {
    await queryClient.invalidateQueries({ queryKey });
  };
  const save = useMutation(
    trpc.newsletter.saveDocument.mutationOptions({
      onSuccess: refreshWorkspace,
    }),
  );
  const generate = useMutation(
    trpc.newsletter.generateDraft.mutationOptions({
      onSuccess: refreshWorkspace,
    }),
  );
  const restore = useMutation(
    trpc.newsletter.restoreVersion.mutationOptions({
      onSuccess: refreshWorkspace,
    }),
  );
  const preview = useMutation(
    trpc.newsletter.renderPreview.mutationOptions({
      onSuccess: ({ html }) => setPreviewHtml(html),
    }),
  );
  const prepareSend = useMutation(
    trpc.newsletter.prepareSend.mutationOptions({
      onSuccess: refreshWorkspace,
    }),
  );
  const approveSend = useMutation(
    trpc.newsletter.approveSend.mutationOptions({
      onSuccess: refreshWorkspace,
    }),
  );
  const sendApproved = useMutation(
    trpc.newsletter.sendApproved.mutationOptions({
      onSuccess: async () => {
        setSendConfirmation("");
        await refreshWorkspace();
      },
    }),
  );

  const renderPreview = () =>
    preview.mutate({ platformPostId: workspace.spot.id, draft });

  useEffect(() => {
    preview.mutate({ platformPostId: workspace.spot.id, draft });
    // Generate the initial projection once per persisted revision. Subsequent
    // unsaved changes are rendered explicitly so typing never causes requests.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.document.currentRevision]);

  const copyHandoff = async () => {
    const result = await queryClient.fetchQuery(
      trpc.newsletter.exportHandoff.queryOptions({
        platformPostId: workspace.spot.id,
      }),
    );
    await navigator.clipboard.writeText(result.markdown);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  };

  const activeJob =
    workspace.latestJob?.status === "queued" ||
    workspace.latestJob?.status === "running";
  const formatLabel =
    workspace.spot.format === "newsletter.blast"
      ? "One-off blast"
      : "Newsletter issue";
  const latestSend = workspace.messageSends[0];
  const numericBroadcastId = Number(providerBroadcastId);
  const numericSegmentId = Number(segmentId);
  const canPrepare =
    workspace.document.currentRevision > 0 &&
    Number.isInteger(numericBroadcastId) &&
    numericBroadcastId > 0 &&
    Number.isInteger(numericSegmentId) &&
    numericSegmentId > 0 &&
    audienceLabel.trim().length > 0;
  const deliveryError =
    prepareSend.error ?? approveSend.error ?? sendApproved.error;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
            <span className="bg-muted rounded-full px-2 py-1 font-medium">
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
          <p className="text-muted-foreground mt-1 text-sm">
            Markdown is the source of truth. The preview is a faithful React
            Email projection, while recipient eligibility and delivery stay in
            the product runtime.
          </p>
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
            className="border-border hover:bg-accent flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium"
          >
            <MessageSquare className="size-4" /> Discuss in chat
          </button>
          <Link
            href={
              workspace.content
                ? `/app/content/${workspace.content.id}`
                : "/app/content"
            }
            className="border-border hover:bg-accent flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium"
          >
            Content item <ExternalLink className="size-3.5" />
          </Link>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)]">
        <div className="space-y-4">
          <section className="bg-card rounded-xl border p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="mb-1 block text-xs font-medium">Subject</span>
                <input
                  value={draft.subject}
                  onChange={(event) =>
                    setDraft({ ...draft, subject: event.target.value })
                  }
                  className={controlClass}
                />
              </label>
              <label className="sm:col-span-2">
                <span className="mb-1 block text-xs font-medium">
                  Preheader
                </span>
                <input
                  value={draft.preheader ?? ""}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      preheader: event.target.value || null,
                    })
                  }
                  className={controlClass}
                  placeholder="Optional inbox preview text"
                />
              </label>
              <label className="sm:col-span-2">
                <span className="mb-1 block text-xs font-medium">
                  Email body · Markdown
                </span>
                <textarea
                  value={draft.bodyMarkdown}
                  onChange={(event) =>
                    setDraft({ ...draft, bodyMarkdown: event.target.value })
                  }
                  className={`${controlClass} min-h-[420px] font-mono text-[13px] leading-6`}
                  placeholder="Write the email here, or generate this selected slot from its brief."
                />
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium">
                  CTA label
                </span>
                <input
                  value={draft.ctaLabel ?? ""}
                  onChange={(event) =>
                    setDraft({ ...draft, ctaLabel: event.target.value || null })
                  }
                  className={controlClass}
                />
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium">CTA URL</span>
                <input
                  value={draft.ctaUrl ?? ""}
                  onChange={(event) =>
                    setDraft({ ...draft, ctaUrl: event.target.value || null })
                  }
                  className={controlClass}
                  placeholder="https://…"
                />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  save.mutate({
                    platformPostId: workspace.spot.id,
                    draft,
                    note: "Saved from the newsletter workspace",
                  })
                }
                disabled={save.isPending}
                className="bg-primary text-primary-foreground flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
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
                onClick={renderPreview}
                disabled={preview.isPending}
                className="border-border hover:bg-accent flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50"
              >
                <RefreshCw
                  className={`size-4 ${preview.isPending ? "animate-spin" : ""}`}
                />
                Refresh preview
              </button>
              <span className="text-muted-foreground text-xs">
                Revision {workspace.document.currentRevision}
              </span>
            </div>
            {(save.error || preview.error) && (
              <p className="mt-2 text-sm text-red-500">
                {(save.error ?? preview.error)?.message}
              </p>
            )}
          </section>

          <section className="bg-card rounded-xl border p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4" />
              <h2 className="font-semibold">Generate this selected issue</h2>
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
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

          <section className="bg-card rounded-xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold">Product handoff</h2>
                <p className="text-muted-foreground mt-1 text-xs">
                  Export approved editorial context for Claude Code in the
                  product repo. Contacts, consent, credentials, and sending are
                  intentionally excluded.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void copyHandoff()}
                className="border-border hover:bg-accent flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium"
              >
                {copied ? (
                  <Check className="size-4 text-emerald-500" />
                ) : (
                  <Clipboard className="size-4" />
                )}
                {copied ? "Copied" : "Copy implementation context"}
              </button>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label>
                <span className="mb-1 block text-xs font-medium">
                  Target product repo
                </span>
                <input
                  value={draft.handoffTargetRepo ?? ""}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      handoffTargetRepo: event.target.value || null,
                    })
                  }
                  className={controlClass}
                  placeholder="wander-web"
                />
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium">
                  Email template key
                </span>
                <input
                  value={draft.templateKey}
                  onChange={(event) =>
                    setDraft({ ...draft, templateKey: event.target.value })
                  }
                  className={controlClass}
                  placeholder="os.marketing.operator.product-update"
                />
              </label>
            </div>
          </section>

          <section className="bg-card rounded-xl border p-4">
            <div className="flex items-center gap-2">
              <MailCheck className="size-4" />
              <h2 className="font-semibold">Customer.io delivery</h2>
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              Growth freezes one saved revision and one provider-managed
              segment. Customer.io remains responsible for live membership,
              consent, suppressions, and the unsubscribe footer.
            </p>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label>
                <span className="mb-1 block text-xs font-medium">
                  API-triggered broadcast ID
                </span>
                <input
                  inputMode="numeric"
                  value={providerBroadcastId}
                  onChange={(event) =>
                    setProviderBroadcastId(event.target.value)
                  }
                  className={controlClass}
                  placeholder="Customer.io broadcast ID"
                />
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium">
                  Customer.io segment ID
                </span>
                <input
                  inputMode="numeric"
                  value={segmentId}
                  onChange={(event) => setSegmentId(event.target.value)}
                  className={controlClass}
                  placeholder="Provider-owned segment"
                />
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium">Audience</span>
                <select
                  value={audienceKind}
                  onChange={(event) =>
                    setAudienceKind(event.target.value as typeof audienceKind)
                  }
                  className={controlClass}
                >
                  <option value="wanderos_operators">WanderOS operators</option>
                  <option value="guests">Operator guests</option>
                  <option value="subscribers">General subscribers</option>
                </select>
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium">
                  Audience label
                </span>
                <input
                  value={audienceLabel}
                  onChange={(event) => setAudienceLabel(event.target.value)}
                  className={controlClass}
                />
              </label>
            </div>

            <button
              type="button"
              onClick={() =>
                prepareSend.mutate({
                  platformPostId: workspace.spot.id,
                  providerBroadcastId: numericBroadcastId,
                  audienceKind,
                  segmentId: numericSegmentId,
                  audienceLabel: audienceLabel.trim(),
                })
              }
              disabled={!canPrepare || prepareSend.isPending}
              className="border-border hover:bg-accent mt-3 flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              {prepareSend.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ShieldCheck className="size-4" />
              )}
              Prepare revision {workspace.document.currentRevision}
            </button>

            {latestSend && (
              <div className="bg-muted/50 mt-4 rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-medium">
                      Revision {latestSend.revision} · {latestSend.status}
                    </span>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {latestSend.audienceLabel} · CIO broadcast{" "}
                      {latestSend.providerBroadcastId} · segment{" "}
                      {latestSend.audienceReference}
                    </p>
                  </div>
                  {(latestSend.status === "draft" ||
                    latestSend.status === "failed") &&
                    workspace.canDeliver && (
                      <button
                        type="button"
                        onClick={() =>
                          approveSend.mutate({
                            messageSendId: latestSend.id,
                          })
                        }
                        disabled={approveSend.isPending}
                        className="bg-primary text-primary-foreground flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                      >
                        <Check className="size-3.5" /> Approve exact revision
                      </button>
                    )}
                </div>

                {latestSend.status === "approved" && workspace.canDeliver && (
                  <div className="mt-3 flex flex-wrap items-end gap-2 border-t pt-3">
                    <label className="min-w-44 flex-1">
                      <span className="mb-1 block text-xs font-medium">
                        Type SEND to confirm
                      </span>
                      <input
                        value={sendConfirmation}
                        onChange={(event) =>
                          setSendConfirmation(event.target.value)
                        }
                        className={controlClass}
                        autoComplete="off"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        sendApproved.mutate({
                          messageSendId: latestSend.id,
                          confirmation: "SEND",
                        })
                      }
                      disabled={
                        sendConfirmation !== "SEND" || sendApproved.isPending
                      }
                      className="flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                    >
                      {sendApproved.isPending ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Send className="size-3.5" />
                      )}
                      Send now
                    </button>
                  </div>
                )}

                {latestSend.sentAt && (
                  <p className="mt-2 text-xs text-emerald-600">
                    Sent {latestSend.sentAt.toLocaleString()}
                    {latestSend.providerMessageId
                      ? ` · provider delivery ${latestSend.providerMessageId}`
                      : ""}
                  </p>
                )}
                {latestSend.error && (
                  <p className="mt-2 text-xs text-red-600">
                    {latestSend.error}
                  </p>
                )}
                {!workspace.canDeliver &&
                  latestSend.status !== "sent" &&
                  latestSend.status !== "sending" && (
                    <p className="text-muted-foreground mt-2 text-xs">
                      An organization owner or admin must approve and send this
                      revision.
                    </p>
                  )}
              </div>
            )}
            {deliveryError && (
              <p className="mt-2 text-sm text-red-600">
                {deliveryError.message}
              </p>
            )}
          </section>

          {workspace.versions.length > 0 && (
            <section className="bg-card rounded-xl border p-4">
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
                      <span className="text-muted-foreground ml-2">
                        {version.source} · {version.createdAt.toLocaleString()}
                      </span>
                      {version.note && (
                        <p className="text-muted-foreground mt-0.5 text-xs">
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
                      className="border-border hover:bg-accent flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
                    >
                      <RotateCcw className="size-3.5" /> Restore
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="xl:sticky xl:top-4 xl:self-start">
          <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
            <div className="border-b bg-slate-50 px-4 py-3 text-xs font-medium text-slate-600">
              Wander email design-system preview · responsive HTML
            </div>
            {previewHtml ? (
              <iframe
                srcDoc={previewHtml}
                sandbox=""
                title="Newsletter preview"
                className="h-[760px] w-full bg-white"
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

export function NewsletterIssueWorkspace({
  platformPostId,
}: {
  platformPostId: string;
}) {
  const trpc = useTRPC();
  const query = useQuery({
    ...trpc.newsletter.workspace.queryOptions({ platformPostId }),
    refetchInterval: (result) => {
      const status = result.state.data?.latestJob?.status;
      return status === "queued" || status === "running" ? 2_000 : false;
    },
  });

  if (query.isLoading) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 py-16 text-sm">
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
