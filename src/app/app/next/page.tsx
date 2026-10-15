"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Loader2, MessageSquare, Users } from "lucide-react";

import { orpc } from "@/orpc/client";

/**
 * The assistant's home: the session list. The conversation itself is the
 * persistent dock that AppLayout mounts on every route; opening a session goes
 * to `/app/next/<threadId>`, where that dock fills the page. Creating a session
 * stays with the dock's own control rather than growing a second create path.
 */
export default function NextPage() {
  const threadsQuery = useQuery(orpc.creativeWork.listThreads.queryOptions());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Next</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sessions with the growth assistant. Open one to work in it at full
          width, or keep using the panel on the right beside any page.
        </p>
      </div>

      {threadsQuery.isPending ? (
        <div className="grid h-40 grid-cols-1 place-items-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : threadsQuery.data?.length ? (
        <ul className="space-y-2">
          {threadsQuery.data.map((thread) => (
            <li key={thread.id}>
              <Link
                href={`/app/next/${encodeURIComponent(thread.id)}`}
                className="flex items-start gap-3 rounded-lg border bg-card px-4 py-3 transition-all duration-200 hover:-translate-y-px hover:border-foreground/20 hover:shadow-md"
              >
                <span className="mt-0.5 grid size-7 shrink-0 grid-cols-1 place-items-center rounded-md bg-primary/10 text-primary">
                  <MessageSquare className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{thread.title}</p>
                  <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
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
        <p className="text-sm text-muted-foreground">
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
