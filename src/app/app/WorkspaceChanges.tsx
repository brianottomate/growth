"use client";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { queryMatchesDomains } from "@/lib/workspace-changes";

/** Reconcile writes made by MCP and background jobs even when chat is closed. */
export function WorkspaceChanges() {
  const queries = useQueryClient();
  const router = useRouter();
  useEffect(() => {
    let cursor = new Date().toISOString();
    let disposed = false;
    let running = false;
    let timer: ReturnType<typeof setTimeout>;
    const seen = new Map<string, string>();
    const poll = async () => {
      if (running || disposed || document.hidden) return;
      running = true;
      try {
        const response = await fetch(
          `/api/workspace/changes?since=${encodeURIComponent(cursor)}`,
          { cache: "no-store" },
        );
        if (!response.ok) return;
        const feed = (await response.json()) as {
          cursor: string;
          changes: { tool: string; revision: string; domains: string[] }[];
        };
        if (disposed) return;
        const domains = new Set<string>();
        for (const change of feed.changes) {
          if (seen.get(change.tool) === change.revision) continue;
          seen.set(change.tool, change.revision);
          for (const domain of change.domains) domains.add(domain);
        }
        cursor = feed.cursor;
        if (domains.size) {
          await queries.invalidateQueries({
            predicate: (query) =>
              queryMatchesDomains(query.queryKey, [...domains]),
          });
          router.refresh();
        }
      } finally {
        running = false;
      }
    };
    const wake = () => {
      void poll().catch(() => undefined);
    };
    const tick = () => {
      wake();
      timer = setTimeout(tick, 30_000);
    };
    tick();
    window.addEventListener("focus", wake);
    window.addEventListener("growth:write", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      disposed = true;
      clearTimeout(timer);
      window.removeEventListener("focus", wake);
      window.removeEventListener("growth:write", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [queries, router]);
  return null;
}
