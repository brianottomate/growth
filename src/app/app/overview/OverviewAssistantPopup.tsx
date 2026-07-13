"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { MessageSquare, PanelRightClose, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useMediaQuery } from "@/components/ui/hooks/use-media-query";
import { cn } from "@/lib/utils";
import {
  ASSISTANT_INTENT_EVENT,
  type AssistantIntent,
  type ContentWorkContext,
} from "@/lib/assistant-events";
import { OverviewChat } from "./OverviewChat";

/**
 * Persistent right-hand workspace for the growth assistant.
 *
 * Desktop: a full-height dock that participates in layout instead of covering
 * the surface the assistant is discussing. Mobile: an overlay. The chat stays
 * mounted while collapsed, preserving one conversation across route changes.
 * On `/app/next`, this same mounted instance expands into the primary surface.
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
  const [workContext, setWorkContext] = useState<ContentWorkContext | null>(
    null,
  );
  const desktop = useMediaQuery("(min-width: 1280px)");
  const nextMode = pathname === "/app/next";
  const queryBrandId = searchParams.get("brandId") ?? intentBrandId;
  const brandSlug = /^\/app\/brands\/([^/]+)$/.exec(pathname)?.[1];
  const activeBrand =
    brands.find((brand) => brand.id === queryBrandId) ??
    brands.find((brand) => brand.slug === brandSlug);
  const visible = nextMode || open;

  useEffect(() => {
    const stored = window.localStorage.getItem("growth_assistant_open");
    setOpen(stored == null ? desktop : stored === "true");
  }, [desktop]);

  useEffect(() => {
    const receiveIntent = (event: Event) => {
      const intent = (event as CustomEvent<AssistantIntent>).detail;
      setIntentBrandId(intent.brandId);
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

  return (
    <>
      {/* One persistent chat instance: a reflowing dock on desktop, overlay below. */}
      <aside
        aria-label="Growth assistant"
        aria-hidden={!visible}
        className={cn(
          "bg-background fixed inset-3 z-50 flex flex-col overflow-hidden rounded-2xl border shadow-2xl transition-[width,opacity,transform] duration-200 xl:static xl:inset-auto xl:z-auto xl:h-svh xl:shrink-0 xl:rounded-none xl:border-y-0 xl:border-r-0 xl:shadow-none",
          visible
            ? cn(
                "translate-y-0 opacity-100",
                nextMode
                  ? "xl:w-[calc(100vw-var(--sidebar-width))] xl:border-l-0"
                  : "xl:w-[472px]",
              )
            : "pointer-events-none invisible translate-y-2 opacity-0 xl:visible xl:w-0 xl:translate-y-0 xl:border-l-0",
        )}
      >
        <header className="flex h-12 shrink-0 items-center gap-3 border-b px-3">
          <span className="bg-primary/10 text-primary grid size-7 place-items-center rounded-lg">
            <Sparkles className="size-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">
              {nextMode
                ? `Next${activeBrand ? ` for ${activeBrand.name}` : ""}`
                : "Assistant"}
            </h2>
            <p className="text-muted-foreground truncate text-[11px]">
              Context · create · inspect · iterate
            </p>
          </div>
          {!nextMode && (
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
          )}
        </header>
        <div className="min-h-0 flex-1">
          <OverviewChat
            userName={userName}
            variant={nextMode ? "page" : "popup"}
            active={visible}
            mode="next"
            brandId={activeBrand?.id}
            brandName={activeBrand?.name}
            intent={searchParams.get("intent") ?? undefined}
            workContext={workContext ?? undefined}
          />
        </div>
      </aside>

      {!visible && (
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
