"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { useMutation } from "@tanstack/react-query";
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
import { useTRPC } from "@/trpc/react";
import { cn } from "@/lib/utils";
import {
  ASSISTANT_INTENT_EVENT,
  type AssistantIntent,
  type ContentWorkContext,
} from "@/lib/assistant-events";
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

/** While-running labels per tool — keyed by capability name. */
const PENDING_LABELS: Record<string, string> = {
  workspaceOverview: "Pulling the workspace snapshot…",
  getBrandMap: "Reading the brand map…",
  nextForBrand: "Checking the next two weeks…",
  previewTwoWeekSlots: "Previewing the two-week rhythm…",
  generateTwoWeekSlots: "Creating the two-week slots…",
  navigateWorkspace: "Opening the workspace surface…",
  listBrands: "Looking up brands…",
  contentPipelineSummary: "Counting the content pipeline…",
  upcomingContent: "Checking the calendar…",
  productionQueue: "Checking production readiness…",
  getContentWorkItem: "Reading the production workspace…",
  getContentStrategy: "Reading pillars, series, and groupings…",
  saveContentPillar: "Saving the pillar…",
  saveContentSeries: "Saving the series…",
  organizeContentIdeas: "Organizing the content ideas…",
  resolveContentGrouping: "Applying the grouping decision…",
  updateContentWorkItem: "Updating the work item…",
  addContentCrossPost: "Adding channel renderings…",
  attachChatImageToContent: "Saving and attaching the image…",
  suggestMediaForContent: "Looking through the library and archives…",
  attachLibraryMediaToContent: "Attaching the library asset…",
  recoverArchiveMediaToContent: "Recovering the archived media…",
  leadsSummary: "Tallying the leads pool…",
  recentMentions: "Scanning the listening queue…",
  adsScope: "Scanning ad performance…",
  topAds: "Ranking ads…",
  listAudienceTargets: "Reading audience strategy…",
  webSearch: "Researching the web…",
  readWebPage: "Reading the source…",
  createAudienceTarget: "Creating the audience target…",
  saveAudienceTargets: "Saving audience profiles…",
  updateAudienceActivation: "Updating campaign targeting…",
  updateAudienceTarget: "Updating the audience target…",
  createPlatformPost: "Creating the channel draft…",
  promotePlatformPost: "Promoting the post into a content idea…",
  createIdea: "Creating the idea…",
  discoverBrandChannels: "Discovering official channels…",
  scrapeBrandPosts: "Scraping recent public posts…",
  syncOwnedBrandContent: "Syncing owned content history…",
  syncBrandWebsite: "Refreshing the website map…",
  syncBrandBlog: "Refreshing the editorial stream…",
  proposeContentGroupings: "Proposing content structure…",
  analyzeMediaAsset: "Analyzing the media asset…",
  draftMomentBlueprint: "Drafting the moment shape…",
  commitMomentPlan: "Creating the initiative and slots…",
  proposeStrategyTargets: "Comparing strategy with observed performance…",
  createChannelCadence: "Creating the channel cadence…",
  updateChannelCadence: "Updating the channel cadence…",
  createBrandMix: "Creating the content mix…",
  updateBrandMix: "Updating the content mix…",
  prepareProductionPacket: "Preparing the production handoff…",
};

/** Friendly fallback names for tools that error/deny before producing a card. */
const TOOL_LABELS: Record<string, string> = {
  workspaceOverview: "Workspace snapshot",
  getBrandMap: "Brand map",
  nextForBrand: "What’s next",
  previewTwoWeekSlots: "Two-week slot preview",
  generateTwoWeekSlots: "Two-week slots",
  navigateWorkspace: "Workspace navigation",
  listBrands: "Brands",
  contentPipelineSummary: "Content pipeline",
  upcomingContent: "Coming up",
  productionQueue: "Production queue",
  prepareProductionPacket: "Production packet",
  getContentWorkItem: "Content work item",
  getContentStrategy: "Content structure",
  saveContentPillar: "Content pillar",
  saveContentSeries: "Content series",
  organizeContentIdeas: "Content organization",
  resolveContentGrouping: "Grouping decision",
  updateContentWorkItem: "Content update",
  addContentCrossPost: "New cross-posts",
  attachChatImageToContent: "Attached image",
  suggestMediaForContent: "Media suggestions",
  attachLibraryMediaToContent: "Attached library asset",
  recoverArchiveMediaToContent: "Recovered archive media",
  leadsSummary: "Leads pool",
  recentMentions: "Social mentions",
  adsScope: "Ad performance",
  topAds: "Top ads",
  listAudienceTargets: "Audience strategy",
  webSearch: "Web research",
  readWebPage: "Page read",
  createAudienceTarget: "New audience target",
  saveAudienceTargets: "Audience profiles",
  updateAudienceActivation: "Campaign targeting",
  updateAudienceTarget: "Audience target update",
  createPlatformPost: "New channel draft",
  promotePlatformPost: "Promoted content idea",
  createIdea: "New idea",
  discoverBrandChannels: "Channel discovery",
  scrapeBrandPosts: "Public post scrape",
  syncOwnedBrandContent: "Owned content sync",
  syncBrandWebsite: "Website map sync",
  syncBrandBlog: "Blog sync",
  proposeContentGroupings: "Content grouping analysis",
  analyzeMediaAsset: "Media analysis",
  draftMomentBlueprint: "Moment blueprint",
  commitMomentPlan: "Committed moment plan",
  proposeStrategyTargets: "Strategy target proposals",
};

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

export function OverviewChat({
  threadId,
  initialMessages,
  onThreadFinish,
  userName,
  variant = "page",
  active = true,
  mode = "overview",
  brandId,
  brandName,
  intent,
  workContext,
}: {
  threadId: string;
  initialMessages: UIMessage[];
  onThreadFinish?: () => void;
  userName: string;
  variant?: "page" | "popup";
  /** Lets the popup focus its composer only when it is actually opened. */
  active?: boolean;
  mode?: "overview" | "create" | "next";
  brandId?: string;
  brandName?: string;
  intent?: string;
  workContext?: ContentWorkContext;
}) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  // Autofocus pops the soft keyboard on touch devices — desktop only.
  const desktop = useMediaQuery("(min-width: 768px)");

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
      body: {
        threadId,
        surface: mode,
        brandId,
        intent,
        workContext,
      },
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onFinish: onThreadFinish,
  });

  const busy = status === "submitted" || status === "streaming";
  const isEmpty = messages.length === 0;
  const navigatedCalls = useRef(new Set<string>());

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

  // Navigation is a portable capability result. The in-app adapter follows it
  // with router.push; MCP clients can use the same returned canonical URL.
  useEffect(() => {
    for (const message of messages) {
      for (const part of message.parts) {
        if (!isToolUIPart(part)) continue;
        const loose = part as {
          toolCallId?: string;
          state: string;
          output?: { action?: string; href?: string; error?: string };
        };
        if (
          loose.state !== "output-available" ||
          loose.output?.action !== "navigate" ||
          !loose.output.href
        )
          continue;
        const key =
          loose.toolCallId ??
          `${message.id}:${getToolName(part)}:${loose.output.href}`;
        if (navigatedCalls.current.has(key)) continue;
        navigatedCalls.current.add(key);
        router.push(loose.output.href);
      }
    }
  }, [messages, router]);

  // ---- image attachment (transient Blob URL → AI SDK file part) ----
  const trpc = useTRPC();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingAttachment, setPendingAttachment] = useState<{
    previewUrl: string;
    blobUrl?: string;
    mediaType: string;
    uploading: boolean;
  } | null>(null);
  const uploadChatImage = useMutation(
    trpc.media.uploadChatImage.mutationOptions(),
  );

  const attachImage = useCallback(
    (dataUrl: string, fileName?: string) => {
      const mediaType = /^data:([^;]+);/.exec(dataUrl)?.[1] ?? "image/png";
      setPendingAttachment({ previewUrl: dataUrl, mediaType, uploading: true });
      uploadChatImage.mutate(
        { dataUrl, fileName },
        {
          onSuccess: (res) =>
            setPendingAttachment((prev) =>
              prev ? { ...prev, blobUrl: res.url, uploading: false } : prev,
            ),
          onError: (err) => {
            toast.error("Couldn't attach image", { description: err.message });
            setPendingAttachment(null);
          },
        },
      );
    },
    [uploadChatImage],
  );

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const item = Array.from(e.clipboardData.items).find((it) =>
      it.type.startsWith("image/"),
    );
    const file = item?.getAsFile();
    if (!file) return;
    e.preventDefault();
    readImageFile(file, (dataUrl) => attachImage(dataUrl, file.name));
  };

  const onFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) readImageFile(file, (dataUrl) => attachImage(dataUrl, file.name));
    e.target.value = "";
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

  const attachmentReady =
    !!pendingAttachment?.blobUrl && !pendingAttachment.uploading;
  const canSend =
    !busy &&
    !pendingAttachment?.uploading &&
    (input.trim().length > 0 || attachmentReady);

  // The composer send — text and/or a ready image attachment (file part).
  const submitComposer = () => {
    if (!canSend) return;
    void sendMessage(
      {
        text: input.trim(),
        ...(attachmentReady
          ? {
              files: [
                {
                  type: "file" as const,
                  mediaType: pendingAttachment.mediaType,
                  url: pendingAttachment.blobUrl!,
                },
              ],
            }
          : {}),
      },
      attachmentReady
        ? {
            body: {
              chatAttachment: {
                url: pendingAttachment.blobUrl!,
                mediaType: pendingAttachment.mediaType,
              },
            },
          }
        : undefined,
    );
    setInput("");
    setPendingAttachment(null);
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
      className={cn(
        "relative flex min-h-0 flex-col",
        variant === "page" ? "h-[calc(100vh-7rem)]" : "h-full",
      )}
    >
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          role="log"
          aria-label="Overview assistant conversation"
          className="h-full scrollbar-thin overflow-y-auto"
        >
          <div
            className={cn(
              "mx-auto w-full space-y-4 pb-4",
              variant === "page" ? "max-w-3xl px-1" : "px-4",
            )}
          >
            {isEmpty && (
              <div
                className={cn(
                  "animate-in fade-in slide-in-from-bottom-2 flex flex-col duration-500",
                  variant === "page" ? "gap-6 pt-10" : "gap-4 pt-4",
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
                  className={cn(
                    "grid auto-rows-fr gap-2",
                    variant === "page" && "sm:grid-cols-2",
                  )}
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
                    "group space-y-2",
                    message.role === "user" && "flex justify-end",
                  )}
                >
                  {message.role === "user" ? (
                    <UserMessage message={message} />
                  ) : (
                    <div className="max-w-[95%] space-y-2">
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
                              <p className="border-border mt-1 border-l-2 pl-3 whitespace-pre-wrap">
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
                              className="text-sm leading-relaxed"
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
                <Loader2 className="h-3 w-3 animate-spin" />
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
        className={cn(
          "mx-auto w-full",
          variant === "page" ? "max-w-3xl" : "border-t px-3 pb-3",
        )}
      >
        <form className="mt-3" onSubmit={submit}>
          <div className="border-border focus-within:border-primary/50 bg-card rounded-xl border p-2.5 shadow-sm transition-[border-color,box-shadow] duration-200 focus-within:shadow-md">
            {pendingAttachment && (
              <div className="relative mb-2 inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={pendingAttachment.previewUrl}
                  alt="Attachment"
                  className="h-16 w-16 rounded-md border object-cover"
                />
                {pendingAttachment.uploading && (
                  <div className="bg-background/60 absolute inset-0 flex items-center justify-center rounded-md">
                    <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setPendingAttachment(null)}
                  aria-label="Remove attachment"
                  className="bg-background hover:bg-muted absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full border shadow-sm transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
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
                  : "Ask about the workspace… (paste or attach an image)"
              }
              rows={1}
              autoFocus={desktop && active}
              className="max-h-40 min-h-9 w-full resize-none border-0 bg-transparent px-1.5 py-1 shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
            <div className="mt-1 flex items-center justify-between">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onFilePicked}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="text-muted-foreground"
                onClick={() => fileInputRef.current?.click()}
                disabled={!!pendingAttachment}
                aria-label="Attach image"
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
        {variant === "page" && (
          <p className="text-muted-foreground/60 mt-1.5 text-center text-[11px]">
            Reads live workspace context · asks before writing
          </p>
        )}
      </div>
    </div>
  );
}

/** Read a File as a base64 data URL (for paste / file-picker attach). */
function readImageFile(file: File, onData: (dataUrl: string) => void) {
  const reader = new FileReader();
  reader.onload = (ev) => {
    if (typeof ev.target?.result === "string") onData(ev.target.result);
  };
  reader.readAsDataURL(file);
}

/** A user message bubble — image attachments stacked above the text. */
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
  return (
    <div className="flex max-w-[85%] flex-col items-end gap-1.5">
      {images.map((p, i) => {
        const url = (p as { url?: string }).url;
        return url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${message.id}-img-${i}`}
            src={url}
            alt="Attachment"
            className="max-h-56 rounded-xl border object-cover"
          />
        ) : null;
      })}
      {text && (
        <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-4 py-2 text-sm whitespace-pre-wrap">
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
  onApprove: (approved: boolean) => void,
  onPrompt: (prompt: string) => void,
  onIntent: (intent: AssistantIntent) => void,
) {
  const toolName = getToolName(part);

  // Write tools (createIdea) pause for the operator's go-ahead. These states
  // aren't in the base ToolUIPart union in this SDK version — read them loosely.
  const loose = part as { state: string; input?: unknown };
  if (loose.state === "approval-requested") {
    return (
      <ApprovalCard
        key={key}
        toolName={toolName}
        input={loose.input}
        onApprove={onApprove}
      />
    );
  }
  if (loose.state === "output-denied") {
    return (
      <p key={key} className="text-muted-foreground text-xs">
        {TOOL_LABELS[toolName] ?? toolName} — skipped.
      </p>
    );
  }

  if (part.state === "input-streaming" || part.state === "input-available") {
    return (
      <ToolCallPending
        key={key}
        label={PENDING_LABELS[toolName] ?? `Running ${toolName}…`}
      />
    );
  }
  if (part.state === "output-error") {
    return (
      <p key={key} className="text-destructive text-xs">
        {TOOL_LABELS[toolName] ?? toolName} failed: {part.errorText}
      </p>
    );
  }
  if (part.state !== "output-available") return null;

  switch (toolName) {
    case "nextForBrand":
      return (
        <NextForBrandCard
          key={key}
          output={part.output as NextForBrandOutput}
          onWork={onIntent}
        />
      );
    case "workspaceOverview":
      return (
        <WorkspaceOverviewCard
          key={key}
          output={part.output as WorkspaceOverviewOutput}
        />
      );
    case "listBrands":
      return <BrandsCard key={key} output={part.output as ListBrandsOutput} />;
    case "navigateWorkspace": {
      const output = part.output as {
        href?: string;
        brandName?: string;
        error?: string;
      };
      if (output.error)
        return (
          <p key={key} className="text-destructive text-xs">
            {output.error}
          </p>
        );
      return (
        <div
          key={key}
          className="bg-muted/40 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs"
        >
          <Check className="size-3.5 text-emerald-500" />
          Opened {output.brandName ?? "the requested surface"}
          {output.href && (
            <Link
              href={output.href}
              className="text-primary ml-auto hover:underline"
            >
              Open again
            </Link>
          )}
        </div>
      );
    }
    case "listAudienceTargets":
      return (
        <AudienceTargetsCard
          key={key}
          output={part.output as AudienceTargetsOutput}
        />
      );
    case "webSearch":
      return (
        <WebSearchCard key={key} output={part.output as WebSearchOutput} />
      );
    case "readWebPage":
      return (
        <ReadWebPageCard key={key} output={part.output as ReadWebPageOutput} />
      );
    case "contentPipelineSummary":
      return (
        <ContentPipelineCard
          key={key}
          output={part.output as ContentPipelineOutput}
        />
      );
    case "getContentStrategy":
      return (
        <ContentStrategyCard
          key={key}
          output={part.output as ContentStrategyOutput}
        />
      );
    case "upcomingContent":
      return (
        <UpcomingContentCard
          key={key}
          output={part.output as UpcomingContentOutput}
        />
      );
    case "productionQueue":
      return (
        <ProductionQueueCard
          key={key}
          output={part.output as ProductionQueueOutput}
          onWork={onIntent}
        />
      );
    case "prepareProductionPacket":
      return (
        <ProductionPacketCard
          key={key}
          output={part.output as ProductionPacketOutput}
        />
      );
    case "suggestMediaForContent":
      return (
        <MediaSuggestionsCard
          key={key}
          output={part.output as MediaSuggestionsOutput}
          onPrompt={onPrompt}
        />
      );
    case "leadsSummary":
      return (
        <LeadsSummaryCard
          key={key}
          output={part.output as LeadsSummaryOutput}
        />
      );
    case "recentMentions":
      return <MentionsCard key={key} output={part.output as MentionsOutput} />;
    case "adsScope":
      return <AdsScopeCard key={key} output={part.output as AdsScopeOutput} />;
    case "topAds":
      return (
        <AdsRankedCard key={key} output={part.output as AdsRankedOutput} />
      );
    case "createIdea":
      return (
        <CreatedIdeaCard key={key} output={part.output as CreatedIdeaOutput} />
      );
    case "saveContentPillar":
    case "saveContentSeries":
    case "organizeContentIdeas":
    case "resolveContentGrouping":
      return (
        <ContentStructureMutationCard
          key={key}
          output={part.output as ContentStructureMutationOutput}
        />
      );
    case "createAudienceTarget":
    case "saveAudienceTargets":
    case "updateAudienceTarget":
      return (
        <AudienceTargetMutationCard
          key={key}
          output={part.output as AudienceTargetMutationOutput}
        />
      );
    default:
      return <GenericToolCard key={key} name={toolName} output={part.output} />;
  }
}

/** Approval gate for a write tool — mirrors SparPanel's pattern. */
function ApprovalCard({
  toolName,
  input,
  onApprove,
}: {
  toolName: string;
  input: unknown;
  onApprove: (approved: boolean) => void;
}) {
  const inp = input as
    | {
        title?: string;
        hook?: string;
        platforms?: string[];
        platform?: string;
        scheduledAt?: string;
        name?: string;
        description?: string | null;
        pillarSlug?: string | null;
        contentPostIds?: string[];
        proposalId?: string;
        decision?: "accept" | "reject";
        intendedChannels?: string[];
        priority?: string;
      }
    | undefined;
  const isAudienceWrite =
    toolName === "createAudienceTarget" || toolName === "updateAudienceTarget";
  const heading =
    toolName === "saveContentPillar"
      ? "Save this content pillar?"
      : toolName === "saveContentSeries"
        ? "Save this content series?"
        : toolName === "organizeContentIdeas"
          ? "Apply this content structure?"
          : toolName === "resolveContentGrouping"
            ? inp?.decision === "reject"
              ? "Dismiss this grouping proposal?"
              : "Accept this grouping proposal?"
            : toolName === "createPlatformPost"
              ? "Create this channel draft?"
              : toolName === "promotePlatformPost"
                ? "Turn this post into a content idea?"
                : toolName === "createIdea"
                  ? "Create this idea?"
                  : toolName === "createAudienceTarget"
                    ? "Create this audience target?"
                    : toolName === "updateAudienceTarget"
                      ? "Save these audience changes?"
                      : toolName === "updateChannelCadence"
                        ? "Save these cadence changes?"
                        : toolName === "updateBrandMix"
                          ? "Save these content mix changes?"
                          : toolName === "attachLibraryMediaToContent"
                            ? "Attach this library asset?"
                            : toolName === "recoverArchiveMediaToContent"
                              ? "Recover and attach this archive media?"
                              : "Confirm this action?";
  const primaryLabel =
    toolName === "saveContentPillar"
      ? "Save pillar"
      : toolName === "saveContentSeries"
        ? "Save series"
        : toolName === "organizeContentIdeas"
          ? "Apply structure"
          : toolName === "resolveContentGrouping"
            ? inp?.decision === "reject"
              ? "Dismiss"
              : "Accept grouping"
            : toolName === "createPlatformPost"
              ? "Create draft"
              : toolName === "promotePlatformPost"
                ? "Promote post"
                : toolName === "createIdea"
                  ? "Create it"
                  : toolName === "createAudienceTarget"
                    ? "Create target"
                    : toolName === "updateAudienceTarget"
                      ? "Save changes"
                      : toolName === "updateChannelCadence"
                        ? "Save cadence"
                        : toolName === "updateBrandMix"
                          ? "Save content mix"
                          : toolName === "attachLibraryMediaToContent"
                            ? "Attach asset"
                            : toolName === "recoverArchiveMediaToContent"
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
      {inp?.platform ? (
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
