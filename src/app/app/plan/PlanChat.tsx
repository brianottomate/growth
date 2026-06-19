"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Streamdown } from "streamdown";

import type { Blueprint } from "./BlueprintReview";

/**
 * Chat front-end for the /plan tool-use agent (`/api/plan/chat`).
 *
 * The v6 `useChat` pattern: manage your own input, call `sendMessage({ text })`,
 * and render each message's `parts`. Text parts stream as text; tool calls
 * arrive as `tool-<name>` parts carrying a `state` and (when done) an `output`.
 *
 * When the agent's `draftBlueprint` tool resolves, we lift the blueprint up to
 * LaunchClient via `onDraft` so it flows into the shared review/Save panel.
 */

// A loose view of an AI SDK v6 tool-invocation part — enough to render it
// without pulling in the full generic ToolUIPart type for this example.
type ToolPart = {
  type: string;
  toolCallId: string;
  state: "input-streaming" | "input-available" | "output-available" | "output-error";
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

const isToolPart = (p: { type: string }): p is ToolPart => p.type.startsWith("tool-");

export type PlanDraft = {
  blueprint: Blueprint;
  brandId?: string;
  name?: string;
};

export function PlanChat({
  selectedBrandId,
  selectedBrandName,
  onDraft,
}: {
  selectedBrandId?: string;
  selectedBrandName?: string;
  onDraft: (draft: PlanDraft) => void;
}) {
  const [input, setInput] = useState("");

  // Recreated when the selected brand changes so the agent is pinned to it.
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/plan/chat",
        body: { brandId: selectedBrandId, brandName: selectedBrandName },
      }),
    [selectedBrandId, selectedBrandName],
  );
  const { messages, sendMessage, status } = useChat({ transport });
  const busy = status === "submitted" || status === "streaming";

  // Lift the latest completed draftBlueprint into the parent — once per call.
  const firedRef = useRef<string | null>(null);
  useEffect(() => {
    let latest: { id: string; bp: Blueprint; input?: unknown } | null = null;
    for (const m of messages) {
      for (const part of m.parts) {
        if (
          isToolPart(part) &&
          part.type === "tool-draftBlueprint" &&
          part.state === "output-available"
        ) {
          const out = part.output as { blueprint?: Blueprint } | undefined;
          if (out?.blueprint) latest = { id: part.toolCallId, bp: out.blueprint, input: part.input };
        }
      }
    }
    if (latest && firedRef.current !== latest.id) {
      firedRef.current = latest.id;
      const inp = latest.input as { brandId?: string; name?: string } | undefined;
      onDraft({ blueprint: latest.bp, brandId: inp?.brandId, name: inp?.name });
    }
  }, [messages, onDraft]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    void sendMessage({ text });
    setInput("");
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-4">
        {messages.length === 0 && (
          <p className="text-muted-foreground text-sm">
            Paste a link (a press release, a landing page) or just describe a
            moment — e.g. “Plan the PMI × Wander partnership announcement.” I’ll
            read it and propose a shape, then you edit and save it below.
          </p>
        )}
        {messages.map((m, mi) => {
          // Animate only the last text part of the assistant message that's
          // still streaming — same rule Homi's MessageList uses.
          const isLast = mi === messages.length - 1;
          const streaming = status === "streaming" && isLast && m.role !== "user";
          let lastTextIdx = -1;
          m.parts.forEach((p, idx) => {
            if (p.type === "text") lastTextIdx = idx;
          });

          return (
            <div key={m.id} className="space-y-2">
              <div className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
                {m.role === "user" ? "You" : "Planner"}
              </div>
              {m.parts.map((part, i) => {
                if (part.type === "text") {
                  // The agent streams markdown prose — render it as such
                  // (headings, lists, links, code) instead of raw text.
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
        })}
      </div>

      <form onSubmit={submit} className="flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) submit(e);
          }}
          rows={2}
          placeholder="Paste a link or describe a moment…"
          className="border-border bg-background flex-1 rounded-md border px-2 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
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
      <div className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-300">
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

  const out = part.output as Record<string, unknown> | undefined;

  // Special-case the blueprint so the headline shape is legible inline (the
  // full editable version renders in the review panel below).
  if (name === "draftBlueprint" && out?.blueprint) {
    return <BlueprintCard bp={out.blueprint as Blueprint} />;
  }

  return (
    <div className="bg-card rounded-md border px-3 py-2">
      <div className="text-muted-foreground mb-1 text-[11px] font-medium">{name}</div>
      <pre className="overflow-x-auto text-xs">{JSON.stringify(out, null, 2)}</pre>
    </div>
  );
}

function BlueprintCard({ bp }: { bp: Blueprint }) {
  if (bp.verdict === "campaign") {
    return (
      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
        <span className="font-medium text-amber-300">Not a content moment.</span>{" "}
        {bp.verdictReason}
      </div>
    );
  }
  return (
    <div className="bg-card rounded-md border p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        {bp.seriesName ?? "Moment"}
        <span className="text-muted-foreground rounded-full border px-1.5 py-0.5 text-[10px]">
          {bp.scale} · {bp.slots.length} slots
        </span>
      </div>
      <ul className="text-muted-foreground mt-2 space-y-1 text-xs">
        {bp.slots.map((s, i) => (
          <li key={i}>
            <span className="text-foreground">{s.title}</span> — day {s.dayOffset},{" "}
            {s.spots.map((sp) => sp.platform).join(", ")}
          </li>
        ))}
      </ul>
      {bp.amplifierAsks.length > 0 && (
        <div className="text-muted-foreground mt-2 text-xs">
          Amplifiers: {bp.amplifierAsks.map((a) => `${a.name} (${a.type})`).join(", ")}
        </div>
      )}
    </div>
  );
}
