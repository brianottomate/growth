"use client";

import { useRef, useState } from "react";
import type { UIMessage } from "ai";
import { ChatNextOptions } from "@/app/app/overview/ChatNextOptions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function InternalNextOptionsPreview({
  payload,
  theme,
  loading,
  reject,
}: {
  payload: unknown;
  theme: string;
  loading: boolean;
  reject: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<string[]>([]);
  const [error, setError] = useState("");
  const composer = useRef<HTMLTextAreaElement>(null);
  const result: UIMessage[] = [
    {
      id: "preview-next-options",
      role: "assistant",
      parts: [
        {
          type: "tool-presentNextOptions",
          toolCallId: "preview-next-options",
          state: "output-available",
          input: { action: "present" },
          output: payload,
        },
      ],
    },
  ];
  function send(text: string) {
    if (!text.trim()) return;
    if (reject) {
      setError("Simulated send failure. Try again.");
      return;
    }
    setMessages((entries) => [...entries, text.trim()]);
    setDraft("");
    setError("");
  }
  return (
    <div data-theme={theme} className="space-y-6 bg-background text-foreground">
      <section className="overflow-hidden rounded-2xl border">
        <div className="flex items-center justify-between border-b px-4 py-3 text-xs">
          <span>Internal · Growth chat</span>
          <span role="status">
            {loading ? "Waiting for tool result" : "Ready"}
          </span>
        </div>
        <div className="p-4">
          <ChatNextOptions
            messages={result}
            disabled={loading}
            choose={(option) => {
              setError("");
              if (option.kind === "detail") {
                setDraft(option.text);
                composer.current?.focus();
              } else send(option.text);
            }}
          />
          <form
            onSubmit={(event) => {
              event.preventDefault();
              send(draft);
            }}
          >
            <Textarea
              ref={composer}
              aria-label="Growth chat draft"
              appearance="composer"
              rows={2}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Write your next message…"
            />
            <div className="mt-2 flex justify-end">
              <Button
                type="submit"
                size="sm"
                disabled={loading || !draft.trim()}
              >
                Send
              </Button>
            </div>
          </form>
          {error && (
            <p role="alert" className="mt-2 text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
      </section>
      <section className="rounded-xl border p-4">
        <h2 className="font-medium">Captured follow-ups</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Messages stay in this preview session.
        </p>
        {messages.length ? (
          <ol className="mt-3 space-y-2">
            {messages.map((text, index) => (
              <li
                key={index}
                className="rounded-lg bg-muted p-3 text-sm whitespace-pre-wrap"
              >
                {text}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Choose a reply, or edit a detail in the composer.
          </p>
        )}
      </section>
    </div>
  );
}
