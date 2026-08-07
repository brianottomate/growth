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
  Pencil,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { SimpleDialog } from "@/components/ui/dialog";
import { sendAssistantIntent } from "@/lib/assistant-events";
import { useTRPC, type RouterOutputs } from "@/trpc/react";
import { DigestImageBoard } from "./DigestImageBoard";

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
  const [copied, setCopied] = useState(false);
  const [providerBroadcastId, setProviderBroadcastId] = useState("");
  const [segmentId, setSegmentId] = useState("");
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
      onSuccess: ({ html, warnings }) => {
        setPreviewHtml(html);
        setPreviewWarnings(warnings ?? []);
      },
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

  const renderPreview = (as: "template" | "full" | "sparse" = viewAs) =>
    preview.mutate({ platformPostId: workspace.spot.id, draft, viewAs: as });

  useEffect(() => {
    preview.mutate({ platformPostId: workspace.spot.id, draft, viewAs });
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
  const pendingReleaseChanges =
    draft.productUpdate?.changes.filter(
      (change) => change.releaseStatus !== "shipped",
    ) ?? [];
  const productUpdateAudienceIsValid =
    !draft.productUpdate || audienceKind === "wanderos_operators";
  const canPrepare =
    workspace.document.currentRevision > 0 &&
    pendingReleaseChanges.length === 0 &&
    productUpdateAudienceIsValid &&
    Number.isInteger(numericBroadcastId) &&
    numericBroadcastId > 0 &&
    Number.isInteger(numericSegmentId) &&
    numericSegmentId > 0;
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
            className="bg-primary text-primary-foreground flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium hover:opacity-90"
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
            className="border-border hover:bg-accent flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium"
          >
            Content item <ExternalLink className="size-3.5" />
          </Link>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)]">
        <div className="space-y-4">
          {/* Chat-first: the conversation is the write path for words (subject,
              intro, CTA); the one clicky exception is photos, because picking
              an image is a recognition task a grid does better than prose. The
              form fields survive below as a collapsed escape hatch. */}
          {draft.digest && (
            <DigestImageBoard
              digest={draft.digest}
              brandId={workspace.brand.id}
              onChange={(digest) => setDraft({ ...draft, digest })}
            />
          )}

          <section className="bg-card rounded-xl border p-4">
            <div className="flex flex-wrap items-center gap-2">
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
                onClick={() => renderPreview()}
                disabled={preview.isPending}
                className="border-border hover:bg-accent flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50"
              >
                <RefreshCw
                  className={`size-4 ${preview.isPending ? "animate-spin" : ""}`}
                />
                Refresh preview
              </button>
              <button
                type="button"
                onClick={() => setFieldsOpen(true)}
                className="border-border hover:bg-accent flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium"
              >
                <Pencil className="size-4" /> Edit fields manually
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
                    draft: next,
                    note: "Edited fields manually",
                  },
                  { onSuccess: () => setFieldsOpen(false) },
                );
              }}
              onOpenChange={setFieldsOpen}
            />
          )}

          {draft.productUpdate && (
            <section className="bg-card rounded-xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-semibold">Verified product evidence</h2>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Customer-facing claims are grounded in these exact changes.
                    Only release-verified evidence can enter delivery.
                  </p>
                </div>
                <span className="bg-muted rounded-full px-2 py-1 text-xs font-medium">
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
                      <span className="bg-muted rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase">
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
                    <p className="text-muted-foreground mt-1 text-xs leading-5">
                      {change.summary}
                    </p>
                    {change.customerImpact && (
                      <p className="mt-1 text-xs">
                        Customer impact: {change.customerImpact}
                      </p>
                    )}
                    <p className="text-muted-foreground mt-1 font-mono text-[11px]">
                      {change.url ? (
                        <a
                          href={change.url}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:text-foreground underline underline-offset-2"
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

            {draft.productUpdate &&
              (pendingReleaseChanges.length > 0 ||
                !productUpdateAudienceIsValid) && (
                <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-800">
                  {pendingReleaseChanges.length > 0
                    ? `Delivery is locked until ${pendingReleaseChanges.length} merged change${pendingReleaseChanges.length === 1 ? " is" : "s are"} verified as shipped.`
                    : "WanderOS product updates can only target the operator audience."}
                </div>
              )}

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
            </div>

            <button
              type="button"
              onClick={() =>
                prepareSend.mutate({
                  platformPostId: workspace.spot.id,
                  providerBroadcastId: numericBroadcastId,
                  audienceKind,
                  segmentId: numericSegmentId,
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
            <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-slate-50 px-4 py-2.5 text-xs font-medium text-slate-600">
              <span>Wander email preview</span>
              {/* Liquid stays raw in the stored document; CIO expands it per
                  recipient. These views simulate that expansion locally — the
                  seed-segment test send in CIO remains the real check. */}
              <div className="flex overflow-hidden rounded-md border border-slate-200">
                {(
                  [
                    ["template", "Template"],
                    ["full", "As Jane (Austin)"],
                    ["sparse", "No attributes"],
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
            className="border-border hover:bg-accent rounded-lg border px-3 py-2 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={() => onSave(fields)}
            className="bg-primary text-primary-foreground flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
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
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className="mb-1 block text-xs font-medium">Subject</span>
          <input
            value={fields.subject}
            onChange={(event) =>
              setFields({ ...fields, subject: event.target.value })
            }
            className={controlClass}
          />
        </label>
        <label className="sm:col-span-2">
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
        <label className="sm:col-span-2">
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
