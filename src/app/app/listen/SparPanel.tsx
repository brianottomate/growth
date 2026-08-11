"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { BookOpen, Check, PenLine, ShieldQuestion, X } from "lucide-react";
import { Streamdown } from "streamdown";

import { Button } from "@/components/ui/button";
import { CHAT_MARKDOWN_LAYOUT } from "@/lib/chat-markdown";
import { isApprovalSuperseded } from "@/lib/chat-approval-state";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type ToolPart = {
  type: string;
  toolCallId: string;
  state:
    | "input-streaming"
    | "input-available"
    | "approval-requested"
    | "approval-responded"
    | "output-available"
    | "output-error"
    | "output-denied";
  input?: unknown;
  output?: unknown;
  errorText?: string;
  approval?: { id: string };
};

const isToolPart = (p: { type: string }): p is ToolPart =>
  p.type.startsWith("tool-");

const EXAMPLE_PROMPTS = [
  "Should we engage here, or pass?",
  "Make the strongest case for passing.",
  "Draft a reply if it's worth one.",
];

export function SparPanel({
  mentionId,
  mentionTitle,
  open,
  onOpenChange,
  onDecisionRecorded,
}: {
  mentionId: string;
  mentionTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired once a recordDecision write lands, so the queue can refresh. */
  onDecisionRecorded: () => void;
}) {
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const recordedRef = useRef<Set<string>>(new Set());

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/listen/spar/chat",
        body: { mentionId },
      }),
    [mentionId],
  );
  const { messages, sendMessage, status, addToolApprovalResponse } = useChat({
    transport,
  });
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // When a recordDecision write completes, refresh the queue (once per call).
  useEffect(() => {
    for (const m of messages) {
      for (const part of m.parts) {
        if (
          isToolPart(part) &&
          part.type === "tool-recordDecision" &&
          part.state === "output-available" &&
          !recordedRef.current.has(part.toolCallId)
        ) {
          const out = part.output as { ok?: boolean } | undefined;
          if (out?.ok) {
            recordedRef.current.add(part.toolCallId);
            onDecisionRecorded();
          }
        }
      }
    }
  }, [messages, onDecisionRecorded]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    void sendMessage({ text: trimmed });
    setInput("");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b">
          <SheetTitle className="text-sm">Spar — should we engage?</SheetTitle>
          <SheetDescription className="line-clamp-2 text-xs">
            {mentionTitle}
          </SheetDescription>
        </SheetHeader>

        <div className="min-w-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="space-y-3 pt-2">
              <p className="text-muted-foreground text-sm">
                I can see this mention, its score, and the subreddit&apos;s
                profile. Let&apos;s think it through — engage, how, or pass.
              </p>
              <div className="flex flex-col gap-1.5">
                {EXAMPLE_PROMPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => send(p)}
                    className="border-border text-muted-foreground hover:bg-muted rounded-lg border px-3 py-1.5 text-left text-xs"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, mi) => {
              const isLast = mi === messages.length - 1;
              const streaming =
                status === "streaming" && isLast && m.role !== "user";
              let lastTextIdx = -1;
              m.parts.forEach((p, idx) => {
                if (p.type === "text") lastTextIdx = idx;
              });

              return (
                <div key={m.id} className="min-w-0 space-y-2">
                  <div className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                    {m.role === "user" ? "You" : "Spar"}
                  </div>
                  {m.parts.map((part, i) => {
                    if (part.type === "text") {
                      return m.role === "user" ? (
                        <p
                          key={i}
                          className="text-sm break-words whitespace-pre-wrap"
                        >
                          {part.text}
                        </p>
                      ) : (
                        <Streamdown
                          key={i}
                          isAnimating={streaming && i === lastTextIdx}
                          className={`${CHAT_MARKDOWN_LAYOUT} text-sm leading-relaxed`}
                        >
                          {part.text}
                        </Streamdown>
                      );
                    }
                    if (isToolPart(part)) {
                      return (
                        <ToolCard
                          key={i}
                          part={part}
                          superseded={isApprovalSuperseded(messages, mi)}
                          onApprove={(approved) =>
                            part.approval &&
                            void addToolApprovalResponse({
                              id: part.approval.id,
                              approved,
                            })
                          }
                        />
                      );
                    }
                    return null;
                  })}
                </div>
              );
            })
          )}
          {status === "submitted" && (
            <p className="text-muted-foreground text-sm">Thinking…</p>
          )}
          <div ref={endRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-end gap-2 border-t p-3"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={2}
            placeholder="Ask, or push back…"
            className="border-border bg-background flex-1 rounded-md border px-3 py-2 text-sm"
          />
          <Button type="submit" size="sm" disabled={busy || !input.trim()}>
            Send
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function ToolCard({
  part,
  superseded,
  onApprove,
}: {
  part: ToolPart;
  superseded: boolean;
  onApprove: (approved: boolean) => void;
}) {
  const name = part.type.replace(/^tool-/, "");

  // The approval gate for the recordDecision write.
  if (part.state === "approval-requested") {
    const input = part.input as
      | { status?: string; decisionNote?: string; replyUrl?: string }
      | undefined;
    return (
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-amber-400">
          <ShieldQuestion className="size-3.5" />
          Record this decision?
        </div>
        <p className="mt-1.5 text-sm">
          Mark as <span className="font-semibold">{input?.status ?? "?"}</span>
          {input?.decisionNote ? (
            <span className="text-muted-foreground italic">
              {" "}
              — {input.decisionNote}
            </span>
          ) : null}
        </p>
        {superseded ? (
          <p className="text-muted-foreground mt-2 text-xs">
            Superseded by a later message. Ask for a fresh approval.
          </p>
        ) : (
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={() => onApprove(true)}>
              <Check className="size-3.5" />
              Record it
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onApprove(false)}
            >
              <X className="size-3.5" />
              Not yet
            </Button>
          </div>
        )}
      </div>
    );
  }

  if (part.state === "output-denied") {
    return (
      <p className="text-muted-foreground text-xs">Decision not recorded.</p>
    );
  }

  if (part.state === "output-error") {
    return (
      <div className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-400">
        {name} failed: {part.errorText ?? "unknown error"}
      </div>
    );
  }

  if (part.state !== "output-available") {
    return (
      <div className="text-muted-foreground flex items-center gap-1.5 rounded-md border border-dashed px-3 py-2 text-xs">
        {name === "draftReply" ? (
          <PenLine className="size-3.5" />
        ) : (
          <BookOpen className="size-3.5" />
        )}
        {name === "draftReply"
          ? "Drafting a reply…"
          : name === "readPlaybook"
            ? "Reading playbook…"
            : `Running ${name}…`}
      </div>
    );
  }

  // Surface a drafted reply prominently; collapse the rest.
  if (name === "draftReply") {
    const out = part.output as { draft?: string } | undefined;
    if (out?.draft) {
      return (
        <div className="bg-card rounded-lg border p-3">
          <div className="text-muted-foreground mb-1 flex items-center gap-1.5 text-[10px] font-medium tracking-wide uppercase">
            <PenLine className="size-3" />
            Draft reply
          </div>
          <p className="text-sm break-words whitespace-pre-wrap">{out.draft}</p>
        </div>
      );
    }
  }

  if (name === "recordDecision") {
    const out = part.output as { status?: string } | undefined;
    return (
      <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
        <Check className="size-3.5" />
        Recorded as {out?.status ?? "done"}.
      </p>
    );
  }

  return (
    <details className="bg-card rounded-md border px-3 py-2">
      <summary className="text-muted-foreground cursor-pointer text-[10px] font-medium tracking-wide uppercase">
        {name}
      </summary>
      <pre className="mt-1 overflow-x-auto text-xs">
        {JSON.stringify(part.output, null, 2)}
      </pre>
    </details>
  );
}
