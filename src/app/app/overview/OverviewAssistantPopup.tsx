"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  Copy,
  Hash,
  Loader2,
  MessageSquare,
  PanelRightClose,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useMediaQuery } from "@/components/ui/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/react";
import {
  ASSISTANT_INTENT_EVENT,
  type AssistantIntent,
  type AdCampaignWorkContext,
  type ContentWorkContext,
} from "@/lib/assistant-events";
import { OverviewChat } from "./OverviewChat";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { assistantThreadAsMarkdown } from "@/lib/assistant-thread-markdown";
import { shouldAutoOpenAssistant } from "@/lib/assistant-route-behavior";

/**
 * Persistent right-hand workspace for the growth assistant.
 *
 * Desktop: a full-height dock that participates in layout instead of covering
 * the surface the assistant is discussing. Mobile: an overlay. The chat stays
 * mounted while collapsed, preserving one conversation across route changes.
 * It is the same dock on every route including `/app/next` — the assistant sits
 * beside the workspace rather than replacing it.
 */
export function OverviewAssistantPopup({
  userName,
  brands,
}: {
  userName: string;
  brands: { id: string; name: string; slug: string | null }[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [intentBrandId, setIntentBrandId] = useState<string | null>(null);
  const [campaignContext, setCampaignContext] =
    useState<AdCampaignWorkContext | null>(null);
  const [workContext, setWorkContext] = useState<ContentWorkContext | null>(
    null,
  );
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const creatingInitialThread = useRef(false);
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const desktop = useMediaQuery("(min-width: 1280px)");
  const nextMode = pathname === "/app/next";
  const queryBrandId = searchParams.get("brandId") ?? intentBrandId;
  const brandSlug = /^\/app\/brands\/([^/]+)$/.exec(pathname)?.[1];
  const activeBrand =
    brands.find((brand) => brand.id === queryBrandId) ??
    brands.find((brand) => brand.slug === brandSlug);
  const threadsQuery = useQuery(trpc.creativeWork.listThreads.queryOptions());
  const createThread = useMutation(
    trpc.creativeWork.createThread.mutationOptions({
      onSuccess: (thread) => {
        creatingInitialThread.current = false;
        setActiveThreadId(thread.id);
        void queryClient.invalidateQueries(
          trpc.creativeWork.listThreads.queryFilter(),
        );
      },
      onError: () => {
        creatingInitialThread.current = false;
      },
    }),
  );
  const threadQuery = useQuery({
    ...trpc.creativeWork.getThread.queryOptions({
      threadId: activeThreadId ?? "",
    }),
    enabled: !!activeThreadId,
  });

  // The assistant home lists sessions as links; opening one selects it in this
  // dock instead of routing to a second chat surface. An unknown id is ignored
  // rather than handed to getThread, which would 404 into a permanent spinner.
  //
  // Applied once per URL change: listThreads refetches on every create and
  // thread-finish, and re-running on its data would snap the dock back to the
  // URL's thread and undo a session the operator just created or picked.
  const requestedThreadId = searchParams.get("thread");
  const appliedThreadId = useRef<string | null>(null);
  useEffect(() => {
    if (!requestedThreadId || !threadsQuery.data) return;
    if (appliedThreadId.current === requestedThreadId) return;
    if (threadsQuery.data.some((thread) => thread.id === requestedThreadId)) {
      appliedThreadId.current = requestedThreadId;
      setActiveThreadId(requestedThreadId);
    }
  }, [requestedThreadId, threadsQuery.data]);

  useEffect(() => {
    if (activeThreadId || !threadsQuery.data) return;
    const latest = threadsQuery.data[0];
    if (latest) {
      setActiveThreadId(latest.id);
      return;
    }
    if (creatingInitialThread.current) return;
    creatingInitialThread.current = true;
    createThread.mutate({ brandId: activeBrand?.id });
  }, [activeBrand?.id, activeThreadId, createThread, threadsQuery.data]);

  useEffect(() => {
    const stored = window.localStorage.getItem("growth_assistant_open");
    const preferred = stored == null ? desktop : stored === "true";
    setOpen(desktop && shouldAutoOpenAssistant(pathname) ? true : preferred);
  }, [desktop, pathname]);

  useEffect(() => {
    const receiveIntent = (event: Event) => {
      const intent = (event as CustomEvent<AssistantIntent>).detail;
      // Not every intent is brand-scoped — the leads pipeline is deliberately
      // global (its own Postgres schema, no organizationId), so a prospect
      // handed to the assistant carries no brand to select.
      setIntentBrandId("brandId" in intent ? (intent.brandId ?? null) : null);
      if (intent.type === "work_ad_campaign") {
        setCampaignContext({
          type: intent.type,
          brandId: intent.brandId,
          brandName: intent.brandName,
          campaignId: intent.campaignId,
          campaignName: intent.campaignName,
        });
      }
      if (intent.type === "work_content_post") {
        setWorkContext({
          type: intent.type,
          brandId: intent.brandId,
          brandName: intent.brandName,
          contentPostId: intent.contentPostId,
          contentTitle: intent.contentTitle,
          platformPostId: intent.platformPostId,
          platform: intent.platform,
        });
      }
      setOpen(true);
      window.localStorage.setItem("growth_assistant_open", "true");
    };
    window.addEventListener(ASSISTANT_INTENT_EVENT, receiveIntent);
    return () =>
      window.removeEventListener(ASSISTANT_INTENT_EVENT, receiveIntent);
  }, []);

  const setVisible = (next: boolean) => {
    setOpen(next);
    window.localStorage.setItem("growth_assistant_open", String(next));
  };

  const activeThread = threadsQuery.data?.find(
    (thread) => thread.id === activeThreadId,
  );
  const copyThreadId = async () => {
    if (!activeThreadId) return;
    await navigator.clipboard.writeText(activeThreadId);
    toast.success("Thread ID copied");
  };
  const copyThreadMarkdown = async () => {
    if (!activeThreadId || !activeThread || !threadQuery.data) return;
    await navigator.clipboard.writeText(
      assistantThreadAsMarkdown({
        threadId: activeThreadId,
        title: activeThread.title,
        messages: threadQuery.data.messages,
      }),
    );
    toast.success("Thread copied as Markdown");
  };

  return (
    <>
      {/* One persistent chat instance: a reflowing dock on desktop, overlay below. */}
      <aside
        aria-label="Growth assistant"
        aria-hidden={!open}
        className={cn(
          "bg-background fixed inset-3 z-50 flex flex-col overflow-hidden rounded-2xl border shadow-2xl transition-[width,opacity,transform] duration-200 xl:static xl:inset-auto xl:z-auto xl:h-svh xl:shrink-0 xl:rounded-none xl:border-y-0 xl:border-r-0 xl:shadow-none",
          open
            ? "translate-y-0 opacity-100 xl:w-[472px]"
            : "pointer-events-none invisible translate-y-2 opacity-0 xl:visible xl:w-0 xl:translate-y-0 xl:border-l-0",
        )}
      >
        <header className="flex h-12 shrink-0 items-center gap-3 border-b px-3">
          <span className="bg-primary/10 text-primary grid size-7 place-items-center rounded-lg">
            <Sparkles className="size-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            {threadsQuery.data?.length ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="hover:bg-accent flex max-w-full items-center gap-1 rounded-md px-1 py-0.5 text-left text-sm font-semibold outline-none"
                    aria-label="Choose assistant session"
                  >
                    <span className="truncate">
                      {activeThread?.title ?? "Session"}
                    </span>
                    <ChevronDown className="text-muted-foreground size-3.5 shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-80 max-w-[calc(100vw-2rem)]"
                >
                  <DropdownMenuLabel>Sessions</DropdownMenuLabel>
                  {threadsQuery.data.map((thread) => (
                    <DropdownMenuItem
                      key={thread.id}
                      onSelect={() => setActiveThreadId(thread.id)}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {thread.title}
                      </span>
                      {thread.id === activeThreadId && (
                        <Check className="size-4" />
                      )}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => void copyThreadMarkdown()}
                    disabled={!threadQuery.data}
                  >
                    <Copy className="size-4" /> Copy thread as Markdown
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void copyThreadId()}>
                    <Hash className="size-4" /> Copy thread ID
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <h2 className="text-sm font-semibold">
                {nextMode
                  ? `Next${activeBrand ? ` for ${activeBrand.name}` : ""}`
                  : "Assistant"}
              </h2>
            )}
            <button
              type="button"
              onClick={() => void copyThreadId()}
              disabled={!activeThreadId}
              title={activeThreadId ?? undefined}
              className="text-muted-foreground hover:text-foreground block max-w-full truncate text-[11px] disabled:pointer-events-none"
            >
              {activeThreadId
                ? `Persistent session · ${activeThreadId}`
                : "Persistent session · context · create · inspect"}
            </button>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() =>
              createThread.mutate({
                brandId: activeBrand?.id,
                contentPostId: workContext?.contentPostId,
              })
            }
            disabled={createThread.isPending}
            aria-label="New assistant session"
            title="New session"
          >
            {createThread.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setVisible(false)}
            aria-label="Collapse assistant"
          >
            <PanelRightClose className="hidden size-4 xl:block" />
            <X className="size-4 xl:hidden" />
          </Button>
        </header>
        <div className="min-h-0 flex-1">
          {activeThreadId && threadQuery.data ? (
            <OverviewChat
              key={activeThreadId}
              threadId={activeThreadId}
              initialMessages={threadQuery.data.messages}
              onThreadFinish={() => {
                void queryClient.invalidateQueries(
                  trpc.creativeWork.getThread.queryFilter({
                    threadId: activeThreadId,
                  }),
                );
                void queryClient.invalidateQueries(
                  trpc.creativeWork.listThreads.queryFilter(),
                );
              }}
              userName={userName}
              active={open}
              mode={nextMode ? "next" : "overview"}
              brandId={activeBrand?.id}
              brandName={activeBrand?.name}
              intent={searchParams.get("intent") ?? undefined}
              seedPrompt={searchParams.get("prompt") ?? undefined}
              workContext={workContext ?? undefined}
              campaignContext={campaignContext ?? undefined}
            />
          ) : (
            <div className="text-muted-foreground grid h-full place-items-center">
              <Loader2 className="size-5 animate-spin" />
            </div>
          )}
        </div>
      </aside>

      {!open && (
        <Button
          type="button"
          size="icon"
          onClick={() => setVisible(true)}
          aria-label="Open growth assistant"
          aria-expanded={false}
          className="fixed right-5 bottom-5 z-50 size-12 rounded-full shadow-lg transition-transform hover:scale-105"
        >
          <MessageSquare className="size-5" />
        </Button>
      )}
    </>
  );
}
