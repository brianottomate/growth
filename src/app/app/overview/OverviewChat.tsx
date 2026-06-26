"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  getToolName,
  isToolUIPart,
  type ToolUIPart,
  type UIMessage,
} from "ai";
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  ChevronRight,
  Copy,
  LayoutDashboard,
  Loader2,
  type LucideIcon,
  MessageCircle,
  RefreshCw,
  Square,
  Users,
} from "lucide-react";
import { Streamdown } from "streamdown";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useMediaQuery } from "@/components/ui/hooks/use-media-query";
import { cn } from "@/lib/utils";
import {
  BrandsCard,
  ContentPipelineCard,
  GenericToolCard,
  LeadsSummaryCard,
  MentionsCard,
  ToolCallPending,
  UpcomingContentCard,
  WorkspaceOverviewCard,
  type ContentPipelineOutput,
  type LeadsSummaryOutput,
  type ListBrandsOutput,
  type MentionsOutput,
  type UpcomingContentOutput,
  type WorkspaceOverviewOutput,
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
  listBrands: "Looking up brands…",
  contentPipelineSummary: "Counting the content pipeline…",
  upcomingContent: "Checking the calendar…",
  leadsSummary: "Tallying the leads pool…",
  recentMentions: "Scanning the listening queue…",
};

/** Friendly fallback names for tools that error/deny before producing a card. */
const TOOL_LABELS: Record<string, string> = {
  workspaceOverview: "Workspace snapshot",
  listBrands: "Brands",
  contentPipelineSummary: "Content pipeline",
  upcomingContent: "Coming up",
  leadsSummary: "Leads pool",
  recentMentions: "Social mentions",
};

const STARTERS: { icon: LucideIcon; text: string }[] = [
  { icon: LayoutDashboard, text: "Catch me up on the whole workspace" },
  { icon: CalendarClock, text: "What's in the content pipeline right now?" },
  { icon: MessageCircle, text: "Any social mentions worth replying to?" },
  { icon: Users, text: "How big is our leads pool?" },
];

export function OverviewChat({ userName }: { userName: string }) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  // Autofocus pops the soft keyboard on touch devices — desktop only.
  const desktop = useMediaQuery("(min-width: 768px)");

  const { messages, sendMessage, status, error, stop, regenerate } = useChat({
    transport: new DefaultChatTransport({ api: "/api/overview/chat" }),
  });

  const busy = status === "submitted" || status === "streaming";
  const isEmpty = messages.length === 0;

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

  const scrollToBottom = () =>
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    void sendMessage({ text: trimmed });
    setInput("");
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    send(input);
  };

  const copyMessageText = (message: UIMessage) => {
    const text = message.parts
      .filter((p) => p.type === "text")
      .map((p) => (p as { text: string }).text)
      .join("\n\n");
    void navigator.clipboard.writeText(text);
  };

  const firstName = userName.split(" ")[0] ?? userName;

  return (
    <div className="relative flex h-[calc(100vh-7rem)] min-h-0 flex-col">
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          role="log"
          aria-label="Overview assistant conversation"
          className="h-full overflow-y-auto"
        >
          <div className="mx-auto w-full max-w-3xl space-y-4 px-1 pb-4">
            {isEmpty && (
              <div className="animate-in fade-in slide-in-from-bottom-2 flex flex-col gap-6 pt-10 duration-500">
                <div>
                  <h1 className="text-2xl font-semibold">Hi {firstName} 👋</h1>
                  <p className="text-muted-foreground mt-1 text-sm">
                    Ask me about what&apos;s happening across the growth
                    workspace — brands, content, leads, listening. This surface
                    is early; I&apos;ll tell you when something is outside what I
                    can see yet.
                  </p>
                </div>
                <div className="grid auto-rows-fr gap-2 sm:grid-cols-2">
                  {STARTERS.map(({ icon: Icon, text }) => (
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
                    <div className="bg-primary text-primary-foreground max-w-[85%] rounded-2xl rounded-br-sm px-4 py-2 text-sm whitespace-pre-wrap">
                      {message.parts
                        .filter((p) => p.type === "text")
                        .map((p) => (p as { text: string }).text)
                        .join("")}
                    </div>
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
                        if (part.type !== "dynamic-tool" && isToolUIPart(part)) {
                          return renderToolPart(part, key);
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

      <div className="mx-auto w-full max-w-3xl">
        <form className="mt-3" onSubmit={submit}>
          <div className="border-border focus-within:border-primary/50 bg-card rounded-xl border p-2.5 shadow-sm transition-[border-color,box-shadow] duration-200 focus-within:shadow-md">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Ask about the workspace…"
              rows={1}
              autoFocus={desktop}
              className="max-h-40 min-h-9 w-full resize-none border-0 bg-transparent px-1.5 py-1 shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
            <div className="mt-1 flex items-center justify-end">
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
                  disabled={!input.trim()}
                  aria-label="Send"
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </form>
        <p className="text-muted-foreground/60 mt-1.5 text-center text-[11px]">
          Reads the live growth workspace · early surface, verify before acting
        </p>
      </div>
    </div>
  );
}

/** Dispatch a tool part to its typed card (or a generic fallback). */
function renderToolPart(part: ToolUIPart, key: string) {
  const toolName = getToolName(part);

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
    case "workspaceOverview":
      return (
        <WorkspaceOverviewCard
          key={key}
          output={part.output as WorkspaceOverviewOutput}
        />
      );
    case "listBrands":
      return <BrandsCard key={key} output={part.output as ListBrandsOutput} />;
    case "contentPipelineSummary":
      return (
        <ContentPipelineCard
          key={key}
          output={part.output as ContentPipelineOutput}
        />
      );
    case "upcomingContent":
      return (
        <UpcomingContentCard
          key={key}
          output={part.output as UpcomingContentOutput}
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
    default:
      return <GenericToolCard key={key} name={toolName} output={part.output} />;
  }
}
