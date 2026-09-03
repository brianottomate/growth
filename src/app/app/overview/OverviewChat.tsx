"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DefaultChatTransport,
  getToolName,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type ToolUIPart,
  type UIMessage,
} from "ai";
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  FileText,
  LayoutDashboard,
  Loader2,
  type LucideIcon,
  MessageCircle,
  Paperclip,
  RefreshCw,
  ShieldQuestion,
  Square,
  Users,
  X,
} from "lucide-react";
import { Streamdown } from "streamdown";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useMediaQuery } from "@/components/ui/hooks/use-media-query";
import { toast } from "@/components/ui/toast";
import {
  ThinkingOrb,
  capabilityOrbState,
} from "@/components/thinking-orb";
import { useTRPC } from "@/trpc/react";
import { CHAT_MARKDOWN_LAYOUT } from "@/lib/chat-markdown";
import { isApprovalSuperseded } from "@/lib/chat-approval-state";
import { formatResolvedPublishingTime } from "@/lib/scheduling-time";
import { cn } from "@/lib/utils";
import {
  chatAttachmentLimitLabel,
  isChatAttachmentMediaType,
  maxChatAttachmentBytes,
  MAX_CHAT_ATTACHMENTS,
} from "@/lib/chat-attachment";
import { putWithProgress } from "@/lib/upload-with-progress";
import { createVideoThumbnail, THUMBNAIL_MIME } from "@/lib/image-thumbnail";
import {
  captureVideoStoryboard,
  storyboardDescriptor,
  uploadStoryboardBoards,
} from "@/lib/video-artifacts";
import {
  GROWTH_CAPABILITY_LABELS,
  isGrowthCapabilityId,
} from "@/lib/growth-capabilities";
import {
  ASSISTANT_INTENT_EVENT,
  type AssistantIntent,
  type AdCampaignWorkContext,
  type ContentWorkContext,
} from "@/lib/assistant-events";
import { capabilityWritesWorkspace } from "@/lib/assistant-write-effect";
import {
  AdsRankedCard,
  AdsScopeCard,
  AudienceTargetsCard,
  BrandsCard,
  ContentPipelineCard,
  ContentStrategyCard,
  ContentStructureMutationCard,
  GenericToolCard,
  LeadsSummaryCard,
  MediaSuggestionsCard,
  MentionsCard,
  NextForBrandCard,
  ProductionPacketCard,
  ProductionQueueCard,
  ProductCapabilityCard,
  ReadWebPageCard,
  ToolCallPending,
  UpcomingContentCard,
  WorkspaceOverviewCard,
  WebSearchCard,
  type AdsRankedOutput,
  type AdsScopeOutput,
  type AudienceTargetsOutput,
  type ContentPipelineOutput,
  type ContentStrategyOutput,
  type ContentStructureMutationOutput,
  type LeadsSummaryOutput,
  type ListBrandsOutput,
  type MediaSuggestionsOutput,
  type MentionsOutput,
  type NextForBrandOutput,
  type ProductionPacketOutput,
  type ProductionQueueOutput,
  type ReadWebPageOutput,
  type UpcomingContentOutput,
  type WorkspaceOverviewOutput,
  type WebSearchOutput,
} from "./OverviewToolCards";

/**
 * General chat surface for the /overview back-office assistant
 * (`/api/overview/chat`). Same AI SDK v6 `useChat` pattern as the /plan chat;
 * tool calls arrive as `tool-<name>` parts and render through typed cards
 * (OverviewToolCards) — the growth-domain analogue of Capient's IqChat, with
 * the chat-shell polish (composer pill, message bubbles, sticky-bottom scroll,
 * per-turn actions, non-flickering working indicator) lifted over and the
 * domain cards rebuilt for this app's capabilities.
 *
 * Deliberately general (no blueprint lift like /plan) — this is meant to grow
 * into the app's home screen.
 */

function toolAction(part: ToolUIPart) {
  const input = (part as { input?: unknown }).input;
  if (typeof input !== "object" || input === null || !("action" in input))
    return undefined;
  return typeof input.action === "string" ? input.action : undefined;
}

function humanizeToolName(value: string) {
  const words = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function toolLabel(toolName: string, action?: string) {
  if (!isGrowthCapabilityId(toolName)) return humanizeToolName(toolName);
  const capability = GROWTH_CAPABILITY_LABELS[toolName].replace(
    /^(Reading|Updating|Opening|Preparing|Synchronizing|Analyzing) /,
    "",
  );
  return action ? `${capability} · ${humanizeToolName(action)}` : capability;
}

function pendingLabel(toolName: string, action?: string) {
  if (!isGrowthCapabilityId(toolName))
    return `Running ${humanizeToolName(action ?? toolName)}…`;
  const base = GROWTH_CAPABILITY_LABELS[toolName];
  return action ? `${base} · ${humanizeToolName(action)}…` : `${base}…`;
}

function completedCapability(part: { output?: unknown }) {
  const output = part.output;
  if (typeof output !== "object" || output === null || !("ok" in output))
    return null;
  const envelope = output as {
    ok: boolean;
    action?: string;
    data?: Record<string, unknown>;
  };
  return envelope.ok ? envelope : null;
}

const OVERVIEW_STARTERS: { icon: LucideIcon; text: string }[] = [
  { icon: LayoutDashboard, text: "Catch me up on the whole workspace" },
  { icon: CalendarClock, text: "What's in the content pipeline right now?" },
  { icon: MessageCircle, text: "Any social mentions worth replying to?" },
  { icon: Users, text: "Research potential audiences for one of our brands" },
];

const NEXT_STARTERS: { icon: LucideIcon; text: string }[] = [
  { icon: CalendarClock, text: "Plan the next two weeks" },
  { icon: MessageCircle, text: "Shape our content pillars and series" },
  { icon: Paperclip, text: "Help me use something I already have" },
  { icon: LayoutDashboard, text: "Turn one channel post into a reusable idea" },
];

const LONG_TEXT_ATTACHMENT_THRESHOLD = 2_000;

type PendingAttachment = {
  id: string;
  previewUrl: string;
  hostedUrl?: string;
  mediaType: string;
  fileName: string;
  progress: number;
  uploading: boolean;
};

export function OverviewChat({
  threadId,
  initialMessages,
  onThreadFinish,
  userName,
  active = true,
  mode = "overview",
  brandId,
  brandName,
  intent,
  seedPrompt,
  workContext,
  campaignContext,
}: {
  threadId: string;
  initialMessages: UIMessage[];
  onThreadFinish?: () => void;
  userName: string;
  /** Lets the popup focus its composer only when it is actually opened. */
  active?: boolean;
  mode?: "overview" | "create" | "next";
  brandId?: string;
  brandName?: string;
  intent?: string;
  /**
   * A composer prefill handed over by a deep link (the media library's
   * "Launch this" rocket). Seeded, never auto-sent: the operator should read
   * and edit it before anything runs.
   */
  seedPrompt?: string;
  workContext?: ContentWorkContext;
  campaignContext?: AdCampaignWorkContext;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [input, setInput] = useState(seedPrompt ?? "");
  // Seed once per deep link. Without the ref, editing the prefill and then
  // any re-render would stomp the operator's edits back to the URL's text.
  const seededRef = useRef(seedPrompt);
  if (seedPrompt && seedPrompt !== seededRef.current) {
    seededRef.current = seedPrompt;
    setInput(seedPrompt);
  }
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  // Autofocus pops the soft keyboard on touch devices — desktop only.
  const desktop = useMediaQuery("(min-width: 768px)");

  // useChat captures the transport when the chat instance is created, but this
  // dock stays mounted across route changes. Read the request body through a
  // ref so every send carries the page the operator is on *now* (and the
  // current brand/work context), not whatever was true at mount.
  const requestBodyRef = useRef<Record<string, unknown>>({});
  requestBodyRef.current = {
    threadId,
    surface: mode,
    brandId,
    intent,
    workContext,
    campaignContext,
    pagePath: pathname,
  };

  const {
    messages,
    sendMessage,
    status,
    error,
    stop,
    regenerate,
    addToolApprovalResponse,
  } = useChat({
    id: `overview-${threadId}`,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/overview/chat",
      body: () => requestBodyRef.current,
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onFinish: onThreadFinish,
  });

  const busy = status === "submitted" || status === "streaming";
  const isEmpty = messages.length === 0;
  const navigatedCalls = useRef(new Set<string>());
  const reconciledCalls = useRef(new Set<string>());
  const historicalToolEffectsInitialized = useRef(false);

  // A persisted thread can contain completed navigate/save tool results. They
  // should still render in the transcript, but replaying their side effects on
  // every mount would move the operator away from the page they just opened
  // (and repeatedly invalidate data for old saves). Only results completed
  // after this chat instance mounts may trigger those effects.
  if (!historicalToolEffectsInitialized.current) {
    for (const message of initialMessages) {
      for (const part of message.parts) {
        if (!isToolUIPart(part)) continue;
        const loose = part as { toolCallId?: string; state: string };
        if (loose.state !== "output-available") continue;
        const completed = completedCapability(part);
        if (!completed) continue;
        const toolName = getToolName(part);
        const key =
          loose.toolCallId ??
          `${message.id}:${toolName}:${completed.action ?? "output"}`;
        if (
          toolName === "navigateWorkspace" ||
          completed.data?.action === "navigate"
        ) {
          navigatedCalls.current.add(key);
        }
        if (capabilityWritesWorkspace(toolName, completed.data)) {
          reconciledCalls.current.add(key);
        }
      }
    }
    historicalToolEffectsInitialized.current = true;
  }

  const submitAssistantIntent = useCallback(
    (assistantIntent: AssistantIntent) => {
      if (busy) {
        toast.info("The assistant is still working");
        return;
      }
      void sendMessage(
        { text: assistantIntent.visibleText },
        { body: { assistantIntent } },
      );
    },
    [busy, sendMessage],
  );

  useEffect(() => {
    const receiveIntent = (event: Event) => {
      submitAssistantIntent((event as CustomEvent<AssistantIntent>).detail);
    };
    window.addEventListener(ASSISTANT_INTENT_EVENT, receiveIntent);
    return () =>
      window.removeEventListener(ASSISTANT_INTENT_EVENT, receiveIntent);
  }, [submitAssistantIntent]);

  // Portable capability results can either navigate or report a durable save.
  // After a save, reconcile both server components and active React Query
  // consumers so the surrounding page reflects the chat write immediately.
  useEffect(() => {
    for (const message of messages) {
      for (const part of message.parts) {
        if (!isToolUIPart(part)) continue;
        const loose = part as { toolCallId?: string; state: string };
        if (loose.state !== "output-available") continue;
        const completed = completedCapability(part);
        if (!completed) continue;
        const toolName = getToolName(part);
        const key =
          loose.toolCallId ??
          `${message.id}:${toolName}:${completed.action ?? "output"}`;
        if (
          capabilityWritesWorkspace(toolName, completed.data) &&
          !reconciledCalls.current.has(key)
        ) {
          reconciledCalls.current.add(key);
          void queryClient.invalidateQueries();
          router.refresh();
          continue;
        }
        const href =
          typeof completed.data?.href === "string"
            ? completed.data.href
            : undefined;
        if (
          (toolName !== "navigateWorkspace" &&
            completed.data?.action !== "navigate") ||
          !href
        )
          continue;
        if (navigatedCalls.current.has(key)) continue;
        navigatedCalls.current.add(key);
        router.push(href);
      }
    }
  }, [messages, queryClient, router]);

  // ---- image attachment (direct browser → R2 → AI SDK file part) ----
  const trpc = useTRPC();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentCountRef = useRef(0);
  // Files the composer refused are reported with the next send so the
  // assistant can route oversized or unsupported work to the media library.
  const skippedAttachmentsRef = useRef<
    Array<{ name: string; sizeMb: number; reason: "unsupported" | "too_large" }>
  >([]);
  const previewUrlsRef = useRef(new Set<string>());
  const [pendingAttachments, setPendingAttachments] = useState<
    PendingAttachment[]
  >([]);
  const [dragActive, setDragActive] = useState(false);
  const createChatUploadUrl = useMutation(
    trpc.media.createChatUploadUrl.mutationOptions(),
  );

  const updatePendingAttachments = useCallback(
    (update: (current: PendingAttachment[]) => PendingAttachment[]) => {
      setPendingAttachments((current) => {
        const next = update(current);
        attachmentCountRef.current = next.length;
        return next;
      });
    },
    [],
  );

  const releasePreview = useCallback((previewUrl: string) => {
    URL.revokeObjectURL(previewUrl);
    previewUrlsRef.current.delete(previewUrl);
  }, []);

  useEffect(
    () => () => {
      for (const previewUrl of previewUrlsRef.current) {
        URL.revokeObjectURL(previewUrl);
      }
      previewUrlsRef.current.clear();
    },
    [],
  );

  const attachFiles = useCallback(
    (files: File[]) => {
      const available = MAX_CHAT_ATTACHMENTS - attachmentCountRef.current;
      if (available <= 0) {
        toast.info(`You can attach up to ${MAX_CHAT_ATTACHMENTS} files`);
        return;
      }

      const valid: File[] = [];
      const recordSkip = (file: File, reason: "unsupported" | "too_large") => {
        if (skippedAttachmentsRef.current.length >= 10) return;
        skippedAttachmentsRef.current.push({
          name: file.name,
          sizeMb: Math.round((file.size / 1024 / 1024) * 10) / 10,
          reason,
        });
      };
      for (const file of files) {
        if (!isChatAttachmentMediaType(file.type)) {
          recordSkip(file, "unsupported");
          toast.error(`Couldn't attach ${file.name}`, {
            description: "Use JPEG, PNG, WebP, AVIF, GIF, MP4, WebM, or MOV",
          });
          continue;
        }
        const maximumSize = maxChatAttachmentBytes(file.type);
        if (!maximumSize || file.size > maximumSize) {
          recordSkip(file, "too_large");
          const limitLabel = chatAttachmentLimitLabel(file.type);
          toast.error(`Couldn't attach ${file.name}`, {
            description: `${file.type.startsWith("video/") ? "Video" : "Image"} is too large${limitLabel ? ` (max ${limitLabel})` : ""}`,
          });
          continue;
        }
        if (valid.length < available) valid.push(file);
      }
      if (valid.length === 0) return;
      if (valid.length < files.length) {
        toast.info(
          `Added ${valid.length} file${valid.length === 1 ? "" : "s"}. A message can contain up to ${MAX_CHAT_ATTACHMENTS}.`,
        );
      }

      const prepared = valid.map((file) => {
        const previewUrl = URL.createObjectURL(file);
        previewUrlsRef.current.add(previewUrl);
        return {
          id: crypto.randomUUID(),
          previewUrl,
          mediaType: file.type || "image/png",
          fileName: file.name,
          file,
        };
      });
      attachmentCountRef.current += prepared.length;
      updatePendingAttachments((current) => [
        ...current,
        ...prepared.map(({ id, previewUrl, mediaType, fileName }) => ({
          id,
          previewUrl,
          mediaType,
          fileName,
          progress: 0,
          uploading: true,
        })),
      ]);

      for (const attachment of prepared) {
        void (async () => {
          try {
            const uploadTarget = await createChatUploadUrl.mutateAsync({
              fileName: attachment.file.name,
              mediaType: attachment.mediaType,
              size: attachment.file.size,
            });
            await putWithProgress(uploadTarget.uploadUrl, attachment.file, {
              contentType: attachment.mediaType,
              timeoutMs: 10 * 60 * 1000,
              onProgress: (fraction) =>
                updatePendingAttachments((current) =>
                  current.map((pending) =>
                    pending.id === attachment.id
                      ? { ...pending, progress: fraction }
                      : pending,
                  ),
                ),
            });

            // A poster frame and a storyboard for video, cut from the file we
            // already have in hand. Without the poster the clip is anonymous
            // everywhere downstream and cannot become a Meta video ad; without
            // the storyboard it cannot be analyzed or tagged once it reaches
            // the library. Best-effort throughout: the attachment itself has
            // already landed, so nothing here may fail it.
            if (attachment.mediaType.startsWith("video/")) {
              const { thumbnailUploadUrl, boardUploadUrls, manifestUploadUrl } =
                uploadTarget;
              const [{ thumbnail }, storyboard] = await Promise.all([
                createVideoThumbnail(attachment.file).catch(() => ({
                  thumbnail: null,
                })),
                captureVideoStoryboard(attachment.file),
              ]);
              const puts: Promise<unknown>[] = [];
              if (thumbnail && thumbnailUploadUrl) {
                puts.push(
                  fetch(thumbnailUploadUrl, {
                    method: "PUT",
                    headers: { "Content-Type": THUMBNAIL_MIME },
                    body: thumbnail,
                  }).catch(() => null),
                );
              }
              if (storyboard && boardUploadUrls && manifestUploadUrl) {
                puts.push(
                  uploadStoryboardBoards(
                    storyboard,
                    (index) => boardUploadUrls[index],
                  ).then((landed) => {
                    const descriptor = storyboardDescriptor(storyboard, landed);
                    if (!descriptor) return null;
                    // The manifest is how the server learns the storyboard
                    // exists once the attachment is promoted; there is no
                    // media row yet to hold it.
                    return fetch(manifestUploadUrl, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(descriptor),
                    }).catch(() => null);
                  }),
                );
              }
              await Promise.all(puts);
            }
            updatePendingAttachments((current) =>
              current.map((pending) =>
                pending.id === attachment.id
                  ? {
                      ...pending,
                      hostedUrl: uploadTarget.url,
                      progress: 1,
                      uploading: false,
                    }
                  : pending,
              ),
            );
          } catch (error) {
            toast.error(`Couldn't attach ${attachment.file.name}`, {
              description:
                error instanceof Error ? error.message : "R2 upload failed",
            });
            releasePreview(attachment.previewUrl);
            updatePendingAttachments((current) =>
              current.filter((pending) => pending.id !== attachment.id),
            );
          }
        })();
      }
    },
    [createChatUploadUrl, releasePreview, updatePendingAttachments],
  );

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData.items)
      .filter((item) => isChatAttachmentMediaType(item.type))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (files.length === 0) return;
    e.preventDefault();
    attachFiles(files);
  };

  const onFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) attachFiles(files);
    e.target.value = "";
  };

  const handlesFiles = (e: React.DragEvent) =>
    e.dataTransfer.types.includes("Files");

  const handleDragEnter = (e: React.DragEvent<HTMLElement>) => {
    if (!handlesFiles(e)) return;
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragOver = (e: React.DragEvent<HTMLElement>) => {
    if (!handlesFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLElement>) => {
    if (
      e.relatedTarget instanceof Node &&
      e.currentTarget.contains(e.relatedTarget)
    ) {
      return;
    }
    setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLElement>) => {
    if (!handlesFiles(e)) return;
    e.preventDefault();
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) attachFiles(files);
  };

  // One consistent "working" indicator. A turn streams in steps — reasoning, a
  // tool call, more reasoning, then the answer — and between steps the tail is
  // often a *finished* part (a settled tool result) while the agent is still
  // working. Show the spinner whenever a turn is in flight, except when the
  // tail already signals activity on its own (streaming answer / pending tool
  // card) — that keeps it from blinking out mid-run and reading as a stall.
  const lastMessage = messages[messages.length - 1];
  const tailPart =
    lastMessage?.role === "assistant"
      ? lastMessage.parts[lastMessage.parts.length - 1]
      : undefined;
  const tailIsPendingTool =
    !!tailPart &&
    isToolUIPart(tailPart) &&
    tailPart.state !== "output-available" &&
    tailPart.state !== "output-error";
  const tailIsStreamingText =
    status === "streaming" &&
    tailPart?.type === "text" &&
    tailPart.text.trim().length > 0;
  const showWorking = busy && !tailIsPendingTool && !tailIsStreamingText;

  // Stick to the bottom while the user is there; never fight an upward scroll.
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  }, []);

  useEffect(() => {
    if (atBottom) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [messages, atBottom]);

  useEffect(() => {
    if (active && desktop) textareaRef.current?.focus();
  }, [active, desktop]);

  const scrollToBottom = () =>
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });

  // Starter chips send a plain text prompt (no attachment).
  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    void sendMessage({ text: trimmed });
    setInput("");
  };

  const readyAttachments = pendingAttachments.filter(
    (attachment): attachment is PendingAttachment & { hostedUrl: string } =>
      Boolean(attachment.hostedUrl) && !attachment.uploading,
  );
  const attachmentsUploading = pendingAttachments.some(
    (attachment) => attachment.uploading,
  );
  const canSend =
    !busy &&
    !attachmentsUploading &&
    (input.trim().length > 0 || readyAttachments.length > 0);

  // The composer sends text and every ready attachment as one durable turn.
  const submitComposer = () => {
    if (!canSend) return;
    const chatAttachments = readyAttachments.map((attachment) => ({
      url: attachment.hostedUrl,
      mediaType: attachment.mediaType,
      fileName: attachment.fileName,
    }));
    const videos = chatAttachments.filter((attachment) =>
      attachment.mediaType.startsWith("video/"),
    );
    const visibleText =
      input.trim() ||
      (videos.length > 0
        ? `Uploaded ${videos.map((video) => video.fileName).join(", ")}.`
        : "");
    const skippedAttachments = skippedAttachmentsRef.current;
    skippedAttachmentsRef.current = [];
    void sendMessage(
      {
        text: visibleText,
        ...(chatAttachments.length > 0
          ? {
              files: chatAttachments.map((attachment) => ({
                type: "file" as const,
                mediaType: attachment.mediaType,
                url: attachment.url,
                filename: attachment.fileName,
              })),
            }
          : {}),
      },
      chatAttachments.length > 0 || skippedAttachments.length > 0
        ? {
            body: {
              ...(chatAttachments.length > 0 ? { chatAttachments } : {}),
              ...(skippedAttachments.length > 0 ? { skippedAttachments } : {}),
            },
          }
        : undefined,
    );
    setInput("");
    for (const attachment of pendingAttachments) {
      releasePreview(attachment.previewUrl);
    }
    attachmentCountRef.current = 0;
    setPendingAttachments([]);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    submitComposer();
  };

  const copyMessageText = (message: UIMessage) => {
    const text = message.parts
      .filter((p) => p.type === "text")
      .map((p) => (p as { text: string }).text)
      .join("\n\n");
    void navigator.clipboard.writeText(text);
  };

  const firstName = userName.split(" ")[0] ?? userName;
  const starters =
    mode === "overview"
      ? OVERVIEW_STARTERS
      : NEXT_STARTERS.map((starter) =>
          starter.text === "Shape our content pillars and series" && brandName
            ? {
                ...starter,
                text: `Shape ${brandName}’s content pillars and series`,
              }
            : starter,
        );

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative flex h-full min-h-0 flex-col"
    >
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          role="log"
          aria-label="Overview assistant conversation"
          className="h-full scrollbar-thin overflow-x-hidden overflow-y-auto"
        >
          <div
            className="mx-auto w-full min-w-0 space-y-4 px-4 pb-4"
          >
            {isEmpty && (
              <div
                className={cn(
                  "animate-in fade-in slide-in-from-bottom-2 flex flex-col gap-4 pt-4 duration-500",
                )}
              >
                <div>
                  <h1 className="text-2xl font-semibold">
                    {mode !== "overview"
                      ? `What’s next${brandName ? ` for ${brandName}` : ""}?`
                      : `Hi ${firstName} 👋`}
                  </h1>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {mode !== "overview"
                      ? "Start with the next two weeks, or paste an image, link, or rough thought. I’ll use the brand context, act when the next step is clear, and take you to the right place to inspect or edit the result."
                      : "Ask me about what’s happening across the growth workspace — brands, content, leads, listening. This surface is early; I’ll tell you when something is outside what I can see yet."}
                  </p>
                </div>
                <div
                  className="grid auto-rows-fr gap-2"
                >
                  {starters.map(({ icon: Icon, text }) => (
                    <button
                      key={text}
                      type="button"
                      onClick={() => send(text)}
                      className="group hover:border-foreground/20 bg-card flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-left transition-all duration-200 hover:-translate-y-px hover:shadow-md"
                    >
                      <span className="bg-primary/10 text-primary grid size-6 shrink-0 place-items-center rounded-md">
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="text-xs leading-snug">{text}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message, messageIdx) => {
              const isLastMessage = messageIdx === messages.length - 1;
              const lastTextIdx = message.parts.reduce(
                (acc, p, i) => (p.type === "text" ? i : acc),
                -1,
              );
              return (
                <div
                  key={message.id}
                  className={cn(
                    "group min-w-0 space-y-2",
                    message.role === "user" && "flex justify-end",
                  )}
                >
                  {message.role === "user" ? (
                    <UserMessage message={message} />
                  ) : (
                    <div className="max-w-[95%] min-w-0 space-y-2">
                      {message.parts.map((part, i) => {
                        const key = `${message.id}-${i}`;
                        if (part.type === "reasoning") {
                          // While reasoning is the live tail of an active turn,
                          // the bottom "working" row is the single thinking
                          // indicator — don't also render a half-formed
                          // collapsible. Show it once it's settled.
                          const streamingTail =
                            status === "streaming" &&
                            isLastMessage &&
                            i === message.parts.length - 1;
                          if (streamingTail || !part.text.trim()) return null;
                          return (
                            <details
                              key={key}
                              className="group/r text-muted-foreground text-xs"
                            >
                              <summary className="hover:text-foreground flex cursor-pointer list-none items-center gap-1 select-none [&::-webkit-details-marker]:hidden">
                                <ChevronRight className="h-3 w-3 transition-transform group-open/r:rotate-90" />
                                Thought process
                              </summary>
                              <p className="border-border mt-1 border-l-2 pl-3 break-words whitespace-pre-wrap">
                                {part.text}
                              </p>
                            </details>
                          );
                        }
                        if (part.type === "text") {
                          if (!part.text.trim()) return null;
                          const shouldAnimate =
                            status === "streaming" &&
                            isLastMessage &&
                            i === lastTextIdx;
                          return (
                            <Streamdown
                              key={key}
                              animated={{ animation: "blurIn", duration: 80 }}
                              isAnimating={shouldAnimate}
                              className={`${CHAT_MARKDOWN_LAYOUT} text-sm leading-relaxed`}
                            >
                              {part.text}
                            </Streamdown>
                          );
                        }
                        if (
                          part.type !== "dynamic-tool" &&
                          isToolUIPart(part)
                        ) {
                          return renderToolPart(
                            part,
                            key,
                            isApprovalSuperseded(messages, messageIdx),
                            (approved) => {
                              const approval = (
                                part as { approval?: { id: string } }
                              ).approval;
                              if (approval)
                                void addToolApprovalResponse({
                                  id: approval.id,
                                  approved,
                                });
                            },
                            send,
                            submitAssistantIntent,
                          );
                        }
                        return null;
                      })}

                      {!busy && (
                        <div className="flex gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 max-lg:opacity-100">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground h-6 w-6"
                            title="Copy"
                            onClick={() => copyMessageText(message)}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                          {isLastMessage && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-muted-foreground h-6 w-6"
                              title="Regenerate"
                              onClick={() => void regenerate()}
                            >
                              <RefreshCw className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {showWorking && (
              <div className="text-muted-foreground flex items-center gap-2 text-xs">
                <ThinkingOrb state="solving" size={20} aria-label="Thinking" />
                Thinking…
              </div>
            )}
            {error && (
              <div className="border-destructive/30 bg-destructive/5 space-y-2 rounded-md border p-3">
                <p className="text-destructive text-xs">
                  Something went wrong. {error.message}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void regenerate()}
                >
                  <RefreshCw className="mr-1.5 h-3 w-3" />
                  Try again
                </Button>
              </div>
            )}
          </div>
        </div>

        {!atBottom && (
          <Button
            variant="outline"
            size="icon"
            onClick={scrollToBottom}
            className="absolute bottom-3 left-1/2 z-10 h-8 w-8 -translate-x-1/2 rounded-full shadow-md"
            aria-label="Scroll to latest"
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div
        className="mx-auto w-full border-t px-3 pb-3"
      >
        <form className="mt-3" onSubmit={submit}>
          <div
            className={cn(
              "border-border focus-within:border-primary/50 bg-card relative rounded-xl border p-2.5 shadow-sm transition-[border-color,box-shadow] duration-200 focus-within:shadow-md",
              dragActive && "border-primary ring-primary/20 ring-2",
            )}
          >
            {dragActive && (
              <div className="bg-card/95 text-foreground absolute inset-0 z-20 flex items-center justify-center rounded-xl text-sm font-medium backdrop-blur-sm">
                Drop images or videos here
              </div>
            )}
            {pendingAttachments.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {pendingAttachments.map((attachment, index) => (
                  <div key={attachment.id} className="relative">
                    {attachment.mediaType.startsWith("video/") ? (
                      <video
                        src={attachment.previewUrl}
                        aria-label={`Video attachment ${index + 1}`}
                        className="h-16 w-24 rounded-md border bg-black object-cover"
                        muted
                        playsInline
                        preload="metadata"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={attachment.previewUrl}
                        alt={`Attachment ${index + 1}`}
                        className="h-16 w-16 rounded-md border object-cover"
                      />
                    )}
                    {attachment.uploading && (
                      <div className="bg-background/70 absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-md">
                        <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
                        <span className="text-[9px] tabular-nums">
                          {Math.round(attachment.progress * 100)}%
                        </span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        releasePreview(attachment.previewUrl);
                        updatePendingAttachments((current) =>
                          current.filter(
                            (pending) => pending.id !== attachment.id,
                          ),
                        );
                      }}
                      aria-label={`Remove attachment ${index + 1}`}
                      className="bg-background hover:bg-muted absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full border shadow-sm transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {input.length >= LONG_TEXT_ATTACHMENT_THRESHOLD && (
              <div className="text-muted-foreground mb-2 flex items-center gap-2 rounded-md border px-2.5 py-2 text-xs">
                <FileText className="size-4 shrink-0" />
                <span className="font-medium">Pasted text</span>
                <span className="ml-auto tabular-nums">
                  {input.length.toLocaleString()} characters
                </span>
              </div>
            )}
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submitComposer();
                }
              }}
              onPaste={handlePaste}
              placeholder={
                mode !== "overview"
                  ? "Ask what’s next, or paste something you want to use…"
                  : "Ask about the workspace… (drop an image or video)"
              }
              rows={1}
              autoFocus={desktop && active}
              className="max-h-40 min-h-9 w-full resize-none border-0 bg-transparent px-1.5 py-1 shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
            <div className="mt-1 flex items-center justify-between">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif,image/gif,video/mp4,video/webm,video/quicktime"
                multiple
                className="hidden"
                onChange={onFilePicked}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="text-muted-foreground"
                onClick={() => fileInputRef.current?.click()}
                disabled={pendingAttachments.length >= MAX_CHAT_ATTACHMENTS}
                aria-label="Attach images or videos"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              {busy ? (
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={() => void stop()}
                  aria-label="Stop generating"
                >
                  <Square className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon"
                  disabled={!canSend}
                  aria-label="Send"
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

/** A user message bubble with its complete media set and compact long text. */
function UserMessage({ message }: { message: UIMessage }) {
  const images = message.parts.filter(
    (p) =>
      p.type === "file" &&
      ((p as { mediaType?: string }).mediaType ?? "").startsWith("image/"),
  );
  const text = message.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join("");
  const videos = message.parts.filter(
    (p) =>
      p.type === "file" &&
      ((p as { mediaType?: string }).mediaType ?? "").startsWith("video/"),
  );
  const longText = text.length >= LONG_TEXT_ATTACHMENT_THRESHOLD;
  return (
    <div className="flex max-w-[85%] flex-col items-end gap-1.5">
      {images.length > 0 && (
        <div
          className={cn(
            "grid max-w-md gap-1.5",
            images.length === 1 ? "grid-cols-1" : "grid-cols-2",
          )}
        >
          {images.map((part, index) => {
            const url = (part as { url?: string }).url;
            return url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${message.id}-img-${index}`}
                src={url}
                alt={`Attachment ${index + 1}`}
                className={cn(
                  "w-full rounded-xl border object-cover",
                  images.length === 1 ? "max-h-56" : "aspect-square",
                )}
              />
            ) : null;
          })}
        </div>
      )}
      {videos.length > 0 && (
        <div className="grid w-full max-w-md gap-1.5">
          {videos.map((part, index) => {
            const file = part as { url?: string; filename?: string };
            return file.url ? (
              <video
                key={`${message.id}-video-${index}`}
                src={file.url}
                aria-label={file.filename ?? `Video attachment ${index + 1}`}
                className="max-h-72 w-full rounded-xl border bg-black"
                controls
                playsInline
                preload="metadata"
              />
            ) : null;
          })}
        </div>
      )}
      {text && longText && (
        <details className="border-primary/30 bg-primary text-primary-foreground group w-full max-w-md overflow-hidden rounded-2xl rounded-br-sm border">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm">
            <FileText className="size-4 shrink-0" />
            <span className="font-medium">Pasted text</span>
            <span className="ml-auto text-xs opacity-70">
              {text.length.toLocaleString()} characters
            </span>
            <ChevronRight className="size-4 shrink-0 transition-transform group-open:rotate-90" />
          </summary>
          <div className="max-h-64 overflow-y-auto border-t border-white/15 px-4 py-3 text-sm break-words whitespace-pre-wrap">
            {text}
          </div>
        </details>
      )}
      {text && !longText && (
        <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-4 py-2 text-sm break-words whitespace-pre-wrap">
          {text}
        </div>
      )}
    </div>
  );
}

/** Dispatch a tool part to its typed card (or a generic fallback). */
function renderToolPart(
  part: ToolUIPart,
  key: string,
  approvalSuperseded: boolean,
  onApprove: (approved: boolean) => void,
  onPrompt: (prompt: string) => void,
  onIntent: (intent: AssistantIntent) => void,
) {
  const toolName = getToolName(part);
  const action = toolAction(part);
  const presentationName = action ? `${toolName}.${action}` : toolName;

  // Write tools (createIdea) pause for the operator's go-ahead. These states
  // aren't in the base ToolUIPart union in this SDK version — read them loosely.
  const loose = part as { state: string; input?: unknown };
  if (loose.state === "approval-requested") {
    return (
      <ApprovalCard
        key={key}
        toolName={presentationName}
        input={loose.input}
        superseded={approvalSuperseded}
        onApprove={onApprove}
      />
    );
  }
  if (loose.state === "output-denied") {
    return (
      <p key={key} className="text-muted-foreground text-xs">
        {toolLabel(toolName, action)} — skipped.
      </p>
    );
  }

  if (part.state === "input-streaming" || part.state === "input-available") {
    return (
      <ToolCallPending
        key={key}
        label={pendingLabel(toolName, action)}
        state={capabilityOrbState(toolName)}
      />
    );
  }
  if (part.state === "output-error") {
    return (
      <p key={key} className="text-destructive text-xs">
        {toolLabel(toolName, action)} failed: {part.errorText}
      </p>
    );
  }
  if (part.state !== "output-available") return null;

  if (!isGrowthCapabilityId(toolName)) {
    return (
      <div
        key={key}
        className="bg-muted/40 text-muted-foreground rounded-lg border px-3 py-2 text-xs"
      >
        This result came from an older Growth assistant version. The surrounding
        conversation is still available; send a new message to use the current
        capability.
      </div>
    );
  }
  // The envelope also carries `suggestedAction`, which is recovery guidance
  // addressed to the model ("Do not retry blindly…"). It stays in the tool
  // result the model reads and out of this card: an operator seeing it reads
  // like the app is talking to itself. Deliberately not in the type below.
  const envelope = part.output as
    | { ok: true; action: string; data: unknown }
    | { ok: false; action?: string; error: { message: string } };
  if (!envelope.ok) {
    return (
      <div
        key={key}
        className="border-destructive/30 bg-destructive/5 rounded-lg border px-3 py-2 text-xs"
      >
        <p className="text-destructive">{envelope.error.message}</p>
      </div>
    );
  }
  const output = envelope.data;
  const outputAction = envelope.action || action;
  const presentationKey = `${toolName}.${outputAction}`;

  if (
    toolName === "productAtlasRead" ||
    toolName === "productAtlasWrite" ||
    toolName === "storefrontRead" ||
    toolName === "storefrontWrite"
  ) {
    return (
      <ProductCapabilityCard
        key={key}
        action={presentationKey}
        output={output}
      />
    );
  }

  switch (presentationKey) {
    case "brandRead.next":
      return (
        <NextForBrandCard
          key={key}
          output={output as NextForBrandOutput}
          onWork={onIntent}
        />
      );
    case "workspaceOverview.overview":
      return (
        <WorkspaceOverviewCard
          key={key}
          output={output as WorkspaceOverviewOutput}
        />
      );
    case "brandRead.list":
      return <BrandsCard key={key} output={output as ListBrandsOutput} />;
    case "navigateWorkspace.navigate": {
      const navigation = output as {
        href?: string;
        brandName?: string;
      };
      return (
        <div
          key={key}
          className="bg-muted/40 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs"
        >
          <Check className="size-3.5 text-emerald-500" />
          Opened {navigation.brandName ?? "the requested surface"}
          {navigation.href && (
            <Link
              href={navigation.href}
              className="text-primary ml-auto hover:underline"
            >
              Open again
            </Link>
          )}
        </div>
      );
    }
    case "audienceRead.list":
      return (
        <AudienceTargetsCard
          key={key}
          output={output as AudienceTargetsOutput}
        />
      );
    case "researchRead.search":
      return <WebSearchCard key={key} output={output as WebSearchOutput} />;
    case "researchRead.readPage":
      return <ReadWebPageCard key={key} output={output as ReadWebPageOutput} />;
    case "contentRead.pipeline":
      return (
        <ContentPipelineCard
          key={key}
          output={output as ContentPipelineOutput}
        />
      );
    case "contentStrategyRead.get":
      return (
        <ContentStrategyCard
          key={key}
          output={output as ContentStrategyOutput}
        />
      );
    case "contentRead.upcoming":
      return (
        <UpcomingContentCard
          key={key}
          output={output as UpcomingContentOutput}
        />
      );
    case "contentRead.productionQueue":
      return (
        <ProductionQueueCard
          key={key}
          output={output as ProductionQueueOutput}
          onWork={onIntent}
        />
      );
    case "prepareProductionPacket.prepare":
      return (
        <ProductionPacketCard
          key={key}
          output={output as ProductionPacketOutput}
        />
      );
    case "contentRead.suggestMedia":
      return (
        <MediaSuggestionsCard
          key={key}
          output={output as MediaSuggestionsOutput}
          onPrompt={onPrompt}
        />
      );
    case "leadsRead.summary":
      return (
        <LeadsSummaryCard key={key} output={output as LeadsSummaryOutput} />
      );
    case "listeningRead.recent":
      return <MentionsCard key={key} output={output as MentionsOutput} />;
    case "adsRead.scope":
      return <AdsScopeCard key={key} output={output as AdsScopeOutput} />;
    case "adsRead.top":
      return <AdsRankedCard key={key} output={output as AdsRankedOutput} />;
    case "contentWrite.createIdea":
      return <CreatedIdeaCard key={key} output={output as CreatedIdeaOutput} />;
    case "contentStrategyWrite.savePillar":
    case "contentStrategyWrite.saveSeries":
    case "contentStrategyWrite.organizeIdeas":
    case "contentStrategyWrite.resolveGrouping":
      return (
        <ContentStructureMutationCard
          key={key}
          output={output as ContentStructureMutationOutput}
        />
      );
    case "audienceWrite.createTarget":
    case "audienceWrite.saveTargets":
    case "audienceWrite.updateTarget":
      return (
        <AudienceTargetMutationCard
          key={key}
          output={output as AudienceTargetMutationOutput}
        />
      );
    default:
      return (
        <GenericToolCard
          key={key}
          name={toolName}
          label={toolLabel(toolName, action)}
          action={outputAction}
          output={output}
        />
      );
  }
}

/** Approval gate for a write tool — mirrors SparPanel's pattern. */
function ApprovalCard({
  toolName,
  input,
  superseded,
  onApprove,
}: {
  toolName: string;
  input: unknown;
  superseded: boolean;
  onApprove: (approved: boolean) => void;
}) {
  const inp = input as
    | {
        title?: string;
        hook?: string;
        platforms?: string[];
        platform?: string;
        localDateTime?: string;
        scheduledAt?: string;
        timeZone?: string;
        name?: string;
        description?: string | null;
        pillarSlug?: string | null;
        contentPostIds?: string[];
        proposalId?: string;
        decision?: "accept" | "reject";
        intendedChannels?: string[];
        priority?: string;
        posts?: Array<{ text?: string }>;
      }
    | undefined;
  const isAudienceWrite =
    toolName === "audienceWrite.createTarget" ||
    toolName === "audienceWrite.updateTarget";
  const isPublishingSchedule = toolName === "publishingWrite.schedule";
  const isPublishingReschedule = toolName === "publishingWrite.reschedule";
  const isSchedulingApproval = isPublishingSchedule || isPublishingReschedule;
  const legacySchedulingApproval = Boolean(
    isSchedulingApproval && !inp?.localDateTime,
  );
  const approvalUnavailable = superseded || legacySchedulingApproval;
  const heading = isPublishingSchedule
    ? "Approve and schedule this post in Zernio?"
    : isPublishingReschedule
      ? "Move this scheduled Zernio post?"
      : toolName === "contentStrategyWrite.savePillar"
        ? "Save this content pillar?"
        : toolName === "contentStrategyWrite.saveSeries"
          ? "Save this content series?"
          : toolName === "contentStrategyWrite.organizeIdeas"
            ? "Apply this content structure?"
            : toolName === "contentStrategyWrite.resolveGrouping"
              ? inp?.decision === "reject"
                ? "Dismiss this grouping proposal?"
                : "Accept this grouping proposal?"
              : toolName === "contentWrite.createPlatformPost"
                ? "Create this channel draft?"
                : toolName === "contentWrite.setThread"
                  ? `Save this ${inp?.posts?.length ?? ""}-post thread?`
                  : toolName === "contentWrite.promotePlatformPost"
                    ? "Turn this post into a content idea?"
                    : toolName === "contentWrite.createIdea"
                      ? "Create this idea?"
                      : toolName === "audienceWrite.createTarget"
                        ? "Create this audience target?"
                        : toolName === "audienceWrite.updateTarget"
                          ? "Save these audience changes?"
                          : toolName === "strategyWrite.updateCadence"
                            ? "Save these cadence changes?"
                            : toolName === "strategyWrite.updateBrandMix"
                              ? "Save these content mix changes?"
                              : toolName ===
                                  "contentMediaWrite.attachLibraryMedia"
                                ? "Attach this library asset?"
                                : toolName ===
                                    "contentMediaWrite.freezeComposition"
                                  ? "Freeze this composition to the library?"
                                  : toolName ===
                                      "contentMediaWrite.makeCarousel"
                                    ? "Turn these images into platform carousels?"
                                    : toolName ===
                                        "contentMediaWrite.recoverArchiveMedia"
                                      ? "Recover and attach this archive media?"
                                      : "Confirm this action?";
  const primaryLabel = isPublishingSchedule
    ? "Approve & schedule"
    : isPublishingReschedule
      ? "Reschedule post"
      : toolName === "contentStrategyWrite.savePillar"
        ? "Save pillar"
        : toolName === "contentStrategyWrite.saveSeries"
          ? "Save series"
          : toolName === "contentStrategyWrite.organizeIdeas"
            ? "Apply structure"
            : toolName === "contentStrategyWrite.resolveGrouping"
              ? inp?.decision === "reject"
                ? "Dismiss"
                : "Accept grouping"
              : toolName === "contentWrite.createPlatformPost"
                ? "Create draft"
                : toolName === "contentWrite.setThread"
                  ? "Save thread"
                  : toolName === "contentWrite.promotePlatformPost"
                    ? "Promote post"
                    : toolName === "contentWrite.createIdea"
                      ? "Create it"
                      : toolName === "audienceWrite.createTarget"
                        ? "Create target"
                        : toolName === "audienceWrite.updateTarget"
                          ? "Save changes"
                          : toolName === "strategyWrite.updateCadence"
                            ? "Save cadence"
                            : toolName === "strategyWrite.updateBrandMix"
                              ? "Save content mix"
                              : toolName ===
                                  "contentMediaWrite.attachLibraryMedia"
                                ? "Attach asset"
                                : toolName ===
                                    "contentMediaWrite.freezeComposition"
                                  ? "Freeze composition"
                                  : toolName ===
                                      "contentMediaWrite.makeCarousel"
                                    ? "Make carousels"
                                    : toolName ===
                                        "contentMediaWrite.recoverArchiveMedia"
                                      ? "Recover & attach"
                                      : "Confirm";
  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-amber-500">
        <ShieldQuestion className="h-3.5 w-3.5" />
        {heading}
      </div>
      {(inp?.title || inp?.name) && (
        <p className="mt-1.5 text-sm font-medium">{inp.title ?? inp.name}</p>
      )}
      {(inp?.hook || inp?.description) && (
        <p className="text-muted-foreground mt-0.5 text-xs">
          {inp.hook ?? inp.description}
        </p>
      )}
      {(inp?.pillarSlug || inp?.contentPostIds?.length) && (
        <p className="text-muted-foreground mt-1 text-xs">
          {[
            inp.pillarSlug ? `Pillar: ${inp.pillarSlug}` : null,
            inp.contentPostIds?.length
              ? `${inp.contentPostIds.length} existing idea${inp.contentPostIds.length === 1 ? "" : "s"}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      {isAudienceWrite && inp?.priority && (
        <p className="text-muted-foreground mt-1 text-xs">
          Priority: {inp.priority.replaceAll("_", " ")}
        </p>
      )}
      {isSchedulingApproval && inp?.localDateTime && inp.timeZone ? (
        <p className="text-muted-foreground mt-1 text-xs">
          {formatResolvedPublishingTime({
            localDateTime: inp.localDateTime,
            timeZone: inp.timeZone,
          })}
        </p>
      ) : inp?.platform ? (
        <p className="text-muted-foreground mt-1 text-xs">
          Channel: {inp.platform}
          {inp.scheduledAt
            ? ` · ${new Date(inp.scheduledAt).toLocaleString()}`
            : ""}
        </p>
      ) : (inp?.platforms ?? inp?.intendedChannels)?.length ? (
        <p className="text-muted-foreground mt-1 text-xs">
          Channels: {(inp.platforms ?? inp.intendedChannels)?.join(", ")}
        </p>
      ) : null}
      {approvalUnavailable ? (
        <p className="text-muted-foreground mt-2 text-xs">
          {superseded
            ? "Superseded by a later message. Ask for a fresh approval."
            : "This older scheduling approval must be regenerated."}
        </p>
      ) : (
        <div className="mt-2 flex gap-2">
          <Button size="sm" onClick={() => onApprove(true)}>
            <Check className="h-3.5 w-3.5" />
            {primaryLabel}
          </Button>
          <Button size="sm" variant="outline" onClick={() => onApprove(false)}>
            <X className="h-3.5 w-3.5" />
            Not yet
          </Button>
        </div>
      )}
    </div>
  );
}

type CreatedIdeaOutput = {
  ok?: boolean;
  id?: string | null;
  title?: string;
  brandName?: string;
  platforms?: string[];
  url?: string | null;
  error?: string;
};

/** Success card for a created idea — links straight to the idea page. */
function CreatedIdeaCard({ output }: { output: CreatedIdeaOutput }) {
  if (output?.error) {
    return <p className="text-destructive text-xs">{output.error}</p>;
  }
  return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-500">
        <Check className="h-3.5 w-3.5" />
        Idea created
      </div>
      <p className="mt-1 text-sm font-medium">{output.title ?? "Untitled"}</p>
      <p className="text-muted-foreground text-xs">
        {output.brandName ?? "—"}
        {output.platforms && output.platforms.length > 0
          ? ` · ${output.platforms.join(", ")}`
          : ""}
      </p>
      {output.url && (
        <Link
          href={output.url}
          className="text-primary mt-1.5 inline-flex items-center gap-1 text-xs font-medium hover:underline"
        >
          Open idea
          <ExternalLink className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

type AudienceTargetMutationOutput = {
  ok?: boolean;
  action?: "created" | "saved" | "updated";
  count?: number;
  target?: {
    name?: string;
    priority?: string;
    intendedChannels?: string[] | null;
  };
  targets?: {
    name?: string;
    priority?: string;
    intendedChannels?: string[] | null;
  }[];
  brandName?: string;
  url?: string | null;
  error?: string;
};

function AudienceTargetMutationCard({
  output,
}: {
  output: AudienceTargetMutationOutput;
}) {
  if (output?.error) {
    return <p className="text-destructive text-xs">{output.error}</p>;
  }
  const target = output.target;
  const targets = output.targets ?? (target ? [target] : []);
  return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-500">
        <Check className="h-3.5 w-3.5" />
        {targets.length > 1
          ? `${targets.length} audience profiles saved`
          : `Audience profile ${output.action ?? "saved"}`}
      </div>
      {targets.length > 1 ? (
        <ul className="mt-1.5 space-y-1">
          {targets.map((item, index) => (
            <li key={`${item.name ?? "audience"}-${index}`} className="text-sm">
              {item.name ?? "Audience profile"}
            </li>
          ))}
        </ul>
      ) : (
        <>
          <p className="mt-1 text-sm font-medium">
            {target?.name ?? "Audience profile"}
          </p>
          <p className="text-muted-foreground text-xs">
            {[output.brandName, target?.priority?.replaceAll("_", " ")]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {target?.intendedChannels && target.intendedChannels.length > 0 && (
            <p className="text-muted-foreground mt-1 text-xs">
              Channels: {target.intendedChannels.join(", ")}
            </p>
          )}
        </>
      )}
      {output.url && (
        <Link
          href={output.url}
          className="text-primary mt-1.5 inline-flex items-center gap-1 text-xs font-medium hover:underline"
        >
          Open audiences
          <ExternalLink className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}
