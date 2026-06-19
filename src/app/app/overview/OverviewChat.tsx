"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Streamdown } from "streamdown";

/**
 * General chat surface for the /overview back-office assistant
 * (`/api/overview/chat`). Same AI SDK v6 `useChat` pattern as the /plan chat:
 * manage your own input, `sendMessage({ text })`, render each message's parts.
 * Text parts stream as markdown via Streamdown; tool calls arrive as
 * `tool-<name>` parts and render through a generic card.
 *
 * Deliberately general (no blueprint lift like /plan) — this is meant to grow
 * into the app's home screen.
 */

type ToolPart = {
  type: string;
  toolCallId: string;
  state:
    | "input-streaming"
    | "input-available"
    | "output-available"
    | "output-error";
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

const isToolPart = (p: { type: string }): p is ToolPart =>
  p.type.startsWith("tool-");

const EXAMPLE_PROMPTS = [
  "What brands do we have?",
  "What's in the content pipeline right now?",
  "What can you help me with?",
];

export function OverviewChat({ userName }: { userName: string }) {
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/overview/chat" }),
    [],
  );
  const { messages, sendMessage, status } = useChat({ transport });
  const busy = status === "submitted" || status === "streaming";

  // Keep the latest turn in view as it streams.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

  const firstName = userName.split(" ")[0] ?? userName;

  return (
    <div className="flex min-h-[calc(100vh-7rem)] flex-col">
      <div className="flex-1 space-y-6">
        {messages.length === 0 ? (
          <div className="flex flex-col gap-4 pt-8">
            <div>
              <h1 className="text-2xl font-semibold">Hi {firstName} 👋</h1>
              <p className="text-muted-foreground mt-1 text-sm">
                Ask me about what&apos;s happening across the growth workspace —
                brands, content, leads, listening. This surface is early; I&apos;ll
                tell you when something is outside what I can see yet.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => send(p)}
                  className="border-border text-muted-foreground hover:bg-muted rounded-full border px-3 py-1.5 text-xs"
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
              <div key={m.id} className="space-y-2">
                <div className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
                  {m.role === "user" ? "You" : "Assistant"}
                </div>
                {m.parts.map((part, i) => {
                  if (part.type === "text") {
                    if (m.role === "user") {
                      return (
                        <p key={i} className="text-sm whitespace-pre-wrap">
                          {part.text}
                        </p>
                      );
                    }
                    return (
                      <Streamdown
                        key={i}
                        animated={{ animation: "blurIn", duration: 80 }}
                        isAnimating={streaming && i === lastTextIdx}
                        className="text-sm leading-relaxed"
                      >
                        {part.text}
                      </Streamdown>
                    );
                  }
                  if (isToolPart(part)) {
                    return <ToolCard key={i} part={part} />;
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
        onSubmit={submit}
        className="bg-background sticky bottom-0 mt-4 flex items-end gap-2 pt-2"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) submit(e);
          }}
          rows={2}
          placeholder="Ask about the workspace…"
          className="border-border bg-background flex-1 rounded-md border px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {busy ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}

function ToolCard({ part }: { part: ToolPart }) {
  const name = part.type.replace(/^tool-/, "");

  if (part.state === "output-error") {
    return (
      <div className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-400">
        {name} failed: {part.errorText ?? "unknown error"}
      </div>
    );
  }

  if (part.state !== "output-available") {
    return (
      <div className="text-muted-foreground rounded-md border border-dashed px-3 py-2 text-xs">
        Running {name}…
      </div>
    );
  }

  return (
    <details className="bg-card rounded-md border px-3 py-2">
      <summary className="text-muted-foreground cursor-pointer text-[11px] font-medium">
        {name}
      </summary>
      <pre className="mt-1 overflow-x-auto text-xs">
        {JSON.stringify(part.output, null, 2)}
      </pre>
    </details>
  );
}
