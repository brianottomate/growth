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
import Link from "next/link";
import { latestAssistantFocus } from "@/lib/assistant-focus";
import { cn } from "@/lib/utils";
import { orpc } from "@/orpc/client";
import {
  ASSISTANT_INTENT_EVENT,
  wantsNewThread,
  type AssistantIntent,
  type AdCampaignWorkContext,
  type ContentWorkContext,
  type CatalogHomeWorkContext,
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
  const [focusByThread, setFocusByThread] = useState<
    Record<
      string,
      {
        brandId?: string;
        campaign?: AdCampaignWorkContext;
        work?: ContentWorkContext;
        catalog?: CatalogHomeWorkContext;
      }
    >
  >({});
  const [scopeByThread, setScopeByThread] = useState<
    Record<string, "page" | "pinned">
  >({});
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const creatingInitialThread = useRef(false);
  const creatingCampaignThread = useRef(false);
  const [threadIntent, setThreadIntent] = useState<{
    threadId: string;
    intent: AssistantIntent;
  } | null>(null);
  const queryClient = useQueryClient();
  const desktop = useMediaQuery("(min-width: 1024px)");
  const nextMode = pathname === "/app/next";
  const pageQuery = useQuery(
    orpc.creativeWork.pageContext.queryOptions({ input: { path: pathname } }),
  );
  const queryBrandId = searchParams.get("brandId");
  const activeBrand =
    pageQuery.data?.brand ?? brands.find((brand) => brand.id === queryBrandId);
  const threadsQuery = useQuery(orpc.creativeWork.listThreads.queryOptions());
  const createThread = useMutation(
    orpc.creativeWork.createThread.mutationOptions({
      onSuccess: (thread) => {
        creatingInitialThread.current = false;
        setActiveThreadId(thread.id);
        void queryClient.invalidateQueries({
          queryKey: orpc.creativeWork.listThreads.queryKey(),
        });
      },
      onError: () => {
        creatingInitialThread.current = false;
      },
    }),
  );
  const threadQuery = useQuery({
    ...orpc.creativeWork.getThread.queryOptions({
      input: {
        threadId: activeThreadId ?? "",
      },
    }),
    enabled: !!activeThreadId,
  });

  const savedFocus = latestAssistantFocus(threadQuery.data?.messages ?? []);
  const savedCampaignContext = savedFocus?.adWorkContext;
  const savedContextMode = savedFocus?.contextMode;
  const threadFocus = activeThreadId
    ? focusByThread[activeThreadId]
    : undefined;
  const pinnedCampaign = threadFocus
    ? threadFocus.campaign
    : (savedCampaignContext ?? undefined);
  const pinnedWork = threadFocus ? threadFocus.work : savedFocus?.workContext;
  const pinnedCatalog = threadFocus
    ? threadFocus.catalog
    : savedFocus?.catalogHomeContext;
  const pinnedBrand = brands.find(
    (brand) =>
      brand.id === (threadFocus ? threadFocus.brandId : savedFocus?.brandId),
  );
  const pinnedLabel = pinnedCatalog
    ? pinnedCatalog.homeName
    : pinnedCampaign
      ? `${pinnedCampaign.brandName} · ${pinnedCampaign.campaignName}${pinnedCampaign.adId ? " · Selected ad" : ""}`
      : pinnedWork
        ? `${pinnedWork.brandName} · ${pinnedWork.contentTitle}${pinnedWork.platform ? ` · ${pinnedWork.platform}` : ""}`
        : pinnedBrand?.name;
  const contextMode =
    (activeThreadId && scopeByThread[activeThreadId]) ||
    savedContextMode ||
    (savedCampaignContext || pinnedCatalog || pinnedWork ? "pinned" : "page");
  const selectScope = (scope: "page" | "pinned") => {
    if (activeThreadId)
      setScopeByThread((previous) => ({
        ...previous,
        [activeThreadId]: scope,
      }));
  };
  const effectiveBrand =
    contextMode === "pinned"
      ? brands.find(
          (brand) =>
            brand.id ===
            (pinnedCatalog?.brandId ??
              pinnedCampaign?.brandId ??
              pinnedWork?.brandId ??
              pinnedBrand?.id),
        )
      : activeBrand;

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
      const focus = {
        brandId: "brandId" in intent ? intent.brandId : undefined,
        campaign: intent.type === "work_ad_campaign" ? intent : undefined,
        work: intent.type === "work_content_post" ? intent : undefined,
        catalog: intent.type === "work_catalog_home" ? intent : undefined,
      };
      const pin = (threadId: string) => {
        setFocusByThread((previous) => ({ ...previous, [threadId]: focus }));
        setScopeByThread((previous) => ({ ...previous, [threadId]: "pinned" }));
      };
      if (wantsNewThread(intent)) {
        if (creatingCampaignThread.current) return;
        creatingCampaignThread.current = true;
        createThread.mutate(
          { brandId: intent.brandId },
          {
            onSuccess: (thread) => {
              setThreadIntent({ threadId: thread.id, intent });
              pin(thread.id);
            },
            onError: () =>
              toast.error("Could not start a new chat. Please try again."),
            onSettled: () => {
              creatingCampaignThread.current = false;
            },
          },
        );
      } else if (activeThreadId) pin(activeThreadId);
      setOpen(true);
      window.localStorage.setItem("growth_assistant_open", "true");
    };
    window.addEventListener(ASSISTANT_INTENT_EVENT, receiveIntent);
    return () =>
      window.removeEventListener(ASSISTANT_INTENT_EVENT, receiveIntent);
  }, [createThread.mutate, activeThreadId]);

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
          "fixed inset-x-2 top-[38svh] bottom-2 z-50 flex flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl transition-[width,opacity,transform] duration-200 lg:static lg:inset-auto lg:z-auto lg:h-svh lg:shrink-0 lg:rounded-none lg:border-y-0 lg:border-r-0 lg:shadow-none",
          open
            ? "translate-y-0 opacity-100 lg:w-[400px] xl:w-[472px]"
            : "pointer-events-none invisible translate-y-2 opacity-0 lg:visible lg:w-0 lg:translate-y-0 lg:border-l-0",
        )}
      >
        <header className="flex h-12 shrink-0 items-center gap-3 border-b px-3">
          <span className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="size-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            {threadsQuery.data?.length ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex max-w-full items-center gap-1 rounded-md px-1 py-0.5 text-left text-sm font-semibold outline-none hover:bg-accent"
                    aria-label="Choose assistant session"
                  >
                    <span className="truncate">
                      {activeThread?.title ?? "Session"}
                    </span>
                    <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
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
            <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
              <p className="truncate">
                {contextMode === "pinned"
                  ? (pinnedLabel ?? "Conversation focus")
                  : (pageQuery.data?.label ??
                    activeBrand?.name ??
                    "Current workspace")}
              </p>
              {/* Shown so a screenshot of the chat names its thread; click copies. */}
              {activeThreadId && (
                <button
                  type="button"
                  onClick={() => void copyThreadId()}
                  className="shrink-0 rounded font-mono text-[10px] text-muted-foreground/70 hover:text-foreground"
                  title="Copy thread ID"
                >
                  {activeThreadId}
                </button>
              )}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() =>
              createThread.mutate({
                brandId: activeBrand?.id,
                contentPostId:
                  contextMode === "pinned"
                    ? pinnedWork?.contentPostId
                    : undefined,
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
            <PanelRightClose className="hidden size-4 lg:block" />
            <X className="size-4 lg:hidden" />
          </Button>
        </header>
        <div
          className="flex min-w-0 items-center gap-1.5 border-b px-3 py-2 text-xs"
          aria-label="Conversation focus"
        >
          <span className="text-muted-foreground">
            {contextMode === "pinned" ? "Focus" : "Page"}
          </span>
          {contextMode === "pinned" && pinnedLabel ? (
            <>
              <Button
                asChild
                variant="outline"
                size="xs"
                className="min-w-0 flex-1 overflow-hidden"
              >
                <Link
                  href={
                    pinnedCatalog && effectiveBrand?.slug
                      ? `/app/performance/brands/${effectiveBrand.slug}/homes/${pinnedCatalog.homeId}`
                      : pinnedWork
                        ? pinnedWork.platform === "newsletter" &&
                          pinnedWork.platformPostId
                          ? `/app/newsletters/${pinnedWork.platformPostId}`
                          : `/app/content/${pinnedWork.contentPostId}`
                        : pinnedCampaign && effectiveBrand?.slug
                          ? `/app/performance/brands/${effectiveBrand.slug}/campaigns/${pinnedCampaign.campaignId}`
                          : `/app/brands/${effectiveBrand?.slug ?? ""}`
                  }
                  title={pinnedLabel}
                >
                  <span className="truncate">{pinnedLabel}</span>
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label="Clear conversation target"
                onClick={() => {
                  if (!activeThreadId) return;
                  setFocusByThread((previous) => ({
                    ...previous,
                    [activeThreadId]: { brandId: effectiveBrand?.id },
                  }));
                  selectScope("pinned");
                }}
              >
                <X className="size-3.5" />
              </Button>
            </>
          ) : (
            <span className="min-w-0 flex-1 truncate">
              {contextMode === "page"
                ? (pageQuery.data?.label ?? pathname)
                : (effectiveBrand?.name ?? "Workspace")}
            </span>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                aria-label="Change conversation focus"
              >
                Change <ChevronDown className="size-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Next message</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => selectScope("page")}>
                Follow current page
              </DropdownMenuItem>
              {pageQuery.data?.brand && (
                <DropdownMenuItem
                  onSelect={() => {
                    const page = pageQuery.data;
                    if (!page?.brand || !activeThreadId) return;
                    const pageBrand = page.brand;
                    setFocusByThread((previous) => ({
                      ...previous,
                      [activeThreadId]: {
                        brandId: pageBrand.id,
                        campaign: page.campaign
                          ? {
                              type: "work_ad_campaign",
                              brandId: pageBrand.id,
                              brandName: pageBrand.name,
                              campaignId: page.campaign.id,
                              campaignName: page.campaign.name,
                            }
                          : undefined,
                      },
                    }));
                    selectScope("pinned");
                  }}
                >
                  Keep{" "}
                  {pageQuery.data.campaign ? "this campaign" : "this brand"} in
                  focus
                </DropdownMenuItem>
              )}
              {pinnedLabel && (
                <DropdownMenuItem onSelect={() => selectScope("pinned")}>
                  Keep conversation focus
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="min-h-0 flex-1">
          {activeThreadId && threadQuery.data ? (
            <OverviewChat
              key={activeThreadId}
              threadId={activeThreadId}
              initialMessages={threadQuery.data.messages}
              initialAssistantIntent={
                threadIntent?.threadId === activeThreadId
                  ? threadIntent.intent
                  : undefined
              }
              onInitialIntentConsumed={() => setThreadIntent(null)}
              onThreadFinish={() => {
                void queryClient.invalidateQueries({
                  queryKey: orpc.creativeWork.getThread.queryKey({
                    input: {
                      threadId: activeThreadId,
                    },
                  }),
                });
                void queryClient.invalidateQueries({
                  queryKey: orpc.creativeWork.listThreads.queryKey(),
                });
              }}
              userName={userName}
              active={open}
              mode={nextMode ? "next" : "overview"}
              brandId={effectiveBrand?.id}
              brandName={effectiveBrand?.name}
              contextMode={contextMode}
              intent={searchParams.get("intent") ?? undefined}
              seedPrompt={searchParams.get("prompt") ?? undefined}
              workContext={
                contextMode === "pinned" ? (pinnedWork ?? undefined) : undefined
              }
              catalogContext={
                contextMode === "pinned"
                  ? (pinnedCatalog ?? undefined)
                  : undefined
              }
              campaignContext={
                contextMode === "pinned"
                  ? (pinnedCampaign ?? undefined)
                  : undefined
              }
            />
          ) : (
            <div className="grid h-full place-items-center text-muted-foreground">
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
          shape="round"
          elevation="floating"
          className="fixed right-5 bottom-5 z-50 size-12 hover:scale-105"
        >
          <MessageSquare className="size-5" />
        </Button>
      )}
    </>
  );
}
