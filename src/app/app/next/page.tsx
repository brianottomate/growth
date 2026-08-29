"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Loader2, MessageSquare, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/react";

/**
 * The assistant's home. The conversation itself lives in the persistent dock
 * that AppLayout mounts on every route, so this surface is the session list
 * that drives it: opening a session sets `?thread=`, which the dock reads.
 * Creating a session stays with the dock's own control rather than growing a
 * second create path here.
 */
export default function NextPage() {
  const trpc = useTRPC();
  const searchParams = useSearchParams();
  const activeThreadId = searchParams.get("thread");
  const threadsQuery = useQuery(trpc.creativeWork.listThreads.queryOptions());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Next</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Sessions with the growth assistant. Pick one up here and it opens in
          the panel on the right, beside whatever you navigate to next.
        </p>
      </div>

      {threadsQuery.isPending ? (
        <div className="text-muted-foreground grid h-40 place-items-center">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : threadsQuery.data?.length ? (
        <ul className="space-y-2">
          {threadsQuery.data.map((thread) => (
            <li key={thread.id}>
              <Link
                href={`/app/next?thread=${encodeURIComponent(thread.id)}`}
                className={cn(
                  "hover:border-foreground/20 bg-card flex items-start gap-3 rounded-lg border px-4 py-3 transition-all duration-200 hover:-translate-y-px hover:shadow-md",
                  thread.id === activeThreadId && "border-primary/50",
                )}
              >
                <span className="bg-primary/10 text-primary mt-0.5 grid size-7 shrink-0 place-items-center rounded-md">
                  <MessageSquare className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{thread.title}</p>
                  <p className="text-muted-foreground mt-0.5 flex items-center gap-2 text-xs">
                    <span>{whenLabel(thread.updatedAt)}</span>
                    {thread.visibility === "shared" && (
                      <span className="flex items-center gap-1">
                        <Users className="size-3" /> Shared
                      </span>
                    )}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">
          No sessions yet. Start one with the + in the assistant panel.
        </p>
      )}
    </div>
  );
}

function whenLabel(updatedAt: Date | string) {
  const date = new Date(updatedAt);
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h ago`;
  if (minutes < 60 * 24 * 7) return `${Math.round(minutes / (60 * 24))}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
