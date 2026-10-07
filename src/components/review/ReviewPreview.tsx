"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { MessageSquare, Check, Send, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReviewStatusBadge } from "./ReviewStatusBadge";

export type ReviewStatus = "draft" | "ready" | "approved";
export function previewReviewStatus(name: string): ReviewStatus {
  if (/canopy|kentucky|cypress/i.test(name)) return "ready";
  if (/serendipity|hero|derby|suite 402/i.test(name)) return "approved";
  return "draft";
}
const previewStatuses = new Map<string, ReviewStatus>();
const listeners = new Set<() => void>();
let revision = 0;
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function usePreviewReviewStatus() {
  useSyncExternalStore(
    subscribe,
    () => revision,
    () => 0,
  );
  return (name: string) =>
    previewStatuses.get(name) ?? previewReviewStatus(name);
}
function updatePreviewStatus(name: string | undefined, status: ReviewStatus) {
  if (!name) return;
  previewStatuses.set(name, status);
  revision += 1;
  listeners.forEach((listener) => listener());
}
export function adReviewStatus(status: string): ReviewStatus {
  return status === "approved"
    ? "approved"
    : status === "ready"
      ? "ready"
      : "draft";
}

export function useReviewPreview() {
  const params = useSearchParams();
  return (
    process.env.NODE_ENV === "development" &&
    params.get("reviewPreview") === "1"
  );
}

type Note = { person: string; text: string };
const initials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
function Person({ name }: { name: string }) {
  return (
    <span
      aria-label={name}
      title={name}
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-semibold"
    >
      {initials(name)}
    </span>
  );
}

/** Shared visual prototype. All transitions and comments stay in component state. */
export function ReviewPreview({
  initialStatus = "approved",
  reviewKey,
  variant = "replacement",
  compact = false,
  actions = true,
}: {
  initialStatus?: ReviewStatus;
  reviewKey?: string;
  variant?: "replacement" | "reopen";
  compact?: boolean;
  actions?: boolean;
}) {
  const [status, setStatus] = useState(
    () => (reviewKey && previewStatuses.get(reviewKey)) || initialStatus,
  );
  const [changed, setChanged] = useState(false);
  const [open, setOpen] = useState(false);
  const discussionId = useId();
  const [text, setText] = useState("");
  const [notes, setNotes] = useState<Note[]>([]);
  const note = (entry: Note) => setNotes((current) => [...current, entry]);
  const transition = (next: ReviewStatus) => {
    setStatus(next);
    updatePreviewStatus(reviewKey, next);
    setChanged(true);
  };
  const revise = () => transition("draft");
  const comments = notes;
  const shown = notes;
  const person = status === "approved" ? "Kristian Boe" : "Silvina Jaume";
  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="flex flex-wrap items-center gap-2 text-xs"
          title={`${status === "approved" ? "Approved by" : status === "ready" ? "Ready by" : "Author"} ${person}`}
        >
          <ReviewStatusBadge status={status} />
          <Person name={person} />
          {!compact && (
            <span className="text-muted-foreground">
              {status === "approved"
                ? "Approved by"
                : status === "ready"
                  ? "Ready by"
                  : "Author"}{" "}
              <span className="text-foreground">{person.split(" ")[0]}</span>
              {status !== "draft" &&
                (changed
                  ? " · just now"
                  : status === "ready"
                    ? " · Oct 5"
                    : " · Oct 6")}
            </span>
          )}
          <Button
            variant={open ? "secondary" : "ghost"}
            size="sm"
            aria-expanded={open}
            aria-controls={discussionId}
            onClick={() => setOpen((value) => !value)}
            aria-label={`${open ? "Hide" : "Show"} review comments`}
          >
            <MessageSquare className="size-3.5" />
            {open ? "Hide comments" : "Comments"}
            {comments.length ? ` · ${comments.length}` : ""}
            <ChevronDown
              aria-hidden="true"
              className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </Button>
        </div>
        {actions && (
          <div className="flex flex-wrap gap-2">
            {status === "draft" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => transition("ready")}
              >
                Mark ready
              </Button>
            )}
            {status === "ready" && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => transition("draft")}
                >
                  Return to draft
                </Button>
                <Button size="sm" onClick={() => transition("approved")}>
                  <Check className="size-3.5" />
                  Approve
                </Button>
              </>
            )}
            {status === "approved" && (
              <Button size="sm" variant="outline" onClick={revise}>
                {variant === "replacement"
                  ? "Create replacement draft"
                  : "Reopen"}
              </Button>
            )}
          </div>
        )}
      </div>
      {open && (
        <section
          id={discussionId}
          aria-label="Review discussion"
          className="space-y-4 border-t pt-4"
        >
          <div className="space-y-4">
            {shown.map((item, index) => (
              <div key={index} className="flex items-start gap-2.5">
                <Person name={item.person} />
                <div className="min-w-0 text-xs">
                  <p className="mb-1 font-medium">{item.person}</p>
                  <p className="leading-relaxed">{item.text}</p>
                </div>
              </div>
            ))}
          </div>
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!text.trim()) return;
              note({ person: "Kristian Boe", text: text.trim() });
              setText("");
            }}
          >
            <textarea
              aria-label="Review comment"
              placeholder="Leave feedback…"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={2}
              className="w-full resize-y rounded-lg border bg-background p-3 text-sm"
            />
            <div className="flex flex-wrap justify-end gap-2">
              {status === "ready" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!text.trim()}
                  onClick={() => {
                    note({
                      person: "Kristian Boe",
                      text: text.trim(),
                    });
                    setText("");
                    transition("draft");
                  }}
                >
                  Request changes
                </Button>
              )}
              <Button size="sm" disabled={!text.trim()}>
                <Send className="size-3.5" />
                Comment
              </Button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
