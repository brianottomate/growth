"use client";

import { useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { MessageSquare, Check, Send, X } from "lucide-react";
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

type Note = { person: string; text: string; version: number; event?: boolean };
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
  const [version, setVersion] = useState(2);
  const [changed, setChanged] = useState(false);
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState(false);
  const [text, setText] = useState("");
  const [notes, setNotes] = useState<Note[]>([
    {
      person: "Kristian Boe",
      text: "Could we lead with the rooftop instead of the location?",
      version: 1,
    },
    {
      person: "Silvina Jaume",
      text: "Updated the opening and selected a brighter photo.",
      version: 2,
    },
    ...(initialStatus !== "draft"
      ? [
          {
            person: "Silvina Jaume",
            text: "Marked ready for review · Oct 5, 3:20 PM",
            version: 2,
            event: true,
          },
        ]
      : []),
    ...(initialStatus === "approved"
      ? [
          {
            person: "Kristian Boe",
            text: "Approved this version · Oct 6, 9:15 AM",
            version: 2,
            event: true,
          },
        ]
      : []),
  ]);
  const note = (entry: Note) => setNotes((current) => [...current, entry]);
  const transition = (next: ReviewStatus, reviewer = false) => {
    setStatus(next);
    updatePreviewStatus(reviewKey, next);
    setChanged(true);
    note({
      person:
        next === "approved" || reviewer ? "Kristian Boe" : "Silvina Jaume",
      text: reviewer
        ? "Requested changes · just now"
        : next === "ready"
          ? "Marked ready for review · just now"
          : next === "approved"
            ? "Approved this version · just now"
            : "Returned to draft · just now",
      version,
      event: true,
    });
  };
  const revise = () => {
    setVersion((current) => current + 1);
    setChanged(true);
    setStatus("draft");
    updatePreviewStatus(reviewKey, "draft");
    note({
      person: "Silvina Jaume",
      text:
        variant === "replacement"
          ? `Created replacement draft from approved v${version}`
          : `Reopened for revision from approved v${version}`,
      version: version + 1,
      event: true,
    });
  };
  const comments = notes.filter((item) => !item.event);
  const shown = notes.filter((item) => history || item.version === version);
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
          {version > 2 && (
            <span className="text-muted-foreground">
              {variant === "replacement" ? "Replacement draft" : "Revision"} · v
              {version}
            </span>
          )}
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
            variant="ghost"
            size="sm"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            aria-label={`${open ? "Hide" : "Show"} review comments`}
          >
            <MessageSquare className="size-3.5" />
            {comments.length}
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
          aria-label="Review discussion"
          className="rounded-xl border bg-muted/20 p-4"
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-semibold">
                Review & comments{" "}
                <span className="font-normal text-muted-foreground">
                  · v{version}
                </span>
              </h4>
              <p className="mt-1 text-xs text-muted-foreground">
                Feedback and sign-off for this version.
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Close review discussion"
              onClick={() => setOpen(false)}
            >
              <X className="size-4" />
            </Button>
          </div>
          <button
            type="button"
            onClick={() => setHistory((value) => !value)}
            className="mb-4 text-xs text-muted-foreground underline underline-offset-4"
          >
            {history ? "Show current version only" : "Show earlier versions"}
          </button>
          <div className="space-y-4">
            {shown.map((item, index) => (
              <div key={index} className="flex items-start gap-2.5">
                <Person name={item.person} />
                <div className="min-w-0 text-xs">
                  <p className="mb-1 font-medium">
                    {item.person}
                    <span className="ml-2 font-normal text-muted-foreground">
                      {item.version !== version
                        ? `Earlier version · v${item.version}`
                        : `v${item.version}`}
                    </span>
                  </p>
                  <p
                    className={
                      item.event ? "text-muted-foreground" : "leading-relaxed"
                    }
                  >
                    {item.text}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <form
            className="mt-5 space-y-2 border-t pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!text.trim()) return;
              note({ person: "Kristian Boe", text: text.trim(), version });
              setText("");
            }}
          >
            <textarea
              aria-label="Review comment"
              placeholder="Leave feedback on this version…"
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
                      version,
                    });
                    setText("");
                    transition("draft", true);
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
