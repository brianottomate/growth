"use client";
import { useState } from "react";
import { ListPlus, Pencil, X, CornerUpLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  chatInputText,
  hasPendingApproval,
  type ChatTurnSnapshot,
} from "@/lib/chat-turns";
export function ChatQueue({
  state,
  control,
}: {
  state: ChatTurnSnapshot | null;
  control: (action: string, id?: string, text?: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  if (!state) return null;
  const pending = state.inputs.filter((input) => input.status !== "running");
  if (!pending.length && !state.paused && !state.stopRequested) return null;
  return (
    <section
      aria-label="Pending messages"
      className="mb-2 rounded-lg border bg-muted/30 p-2 text-xs"
    >
      <div className="flex items-center gap-2">
        <ListPlus className="size-3.5" />
        <span className="flex-1 font-medium">
          {state.stopRequested
            ? "Stopping after current work"
            : state.paused
              ? "Queue paused"
              : hasPendingApproval(state.messages)
                ? "Waiting for approval"
                : `${pending.length} pending`}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void control(state.paused ? "resume" : "pause")}
        >
          {state.paused ? "Resume" : "Pause"}
        </Button>
      </div>
      <div className="max-h-48 overflow-y-auto">
        {pending.map((input) => (
          <div
            key={input.id}
            className="mt-1 rounded-md border bg-background p-2"
          >
            {editing === input.id ? (
              <div>
                <Textarea
                  aria-label="Edit queued message"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={2}
                />
                <div className="mt-1 flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    disabled={!draft.trim()}
                    onClick={() =>
                      void control("edit", input.id, draft).then((saved) => {
                        if (saved) setEditing(null);
                      })
                    }
                  >
                    Save
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditing(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 break-words">
                    <span className="font-medium">
                      {input.status === "steering"
                        ? "Correction: "
                        : input.status === "failed"
                          ? "Needs attention: "
                          : "Queued: "}
                    </span>
                    {chatInputText(input)}
                  </p>
                  {input.error && (
                    <p className="mt-1 text-muted-foreground" role="alert">
                      {input.error}
                    </p>
                  )}
                  {!input.owned && (
                    <p className="mt-1 text-muted-foreground">
                      Waiting for the teammate who submitted this message.
                    </p>
                  )}
                </div>
                {input.owned && (
                  <div className="flex shrink-0 gap-1">
                    {input.status === "queued" && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Edit queued message"
                        onClick={() => {
                          setEditing(input.id);
                          setDraft(
                            input.payload.message.parts
                              .flatMap((part) =>
                                part.type === "text" ? [part.text] : [],
                              )
                              .join("\n"),
                          );
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                    )}
                    {input.status === "failed" && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Retry message"
                        onClick={() => void control("retry", input.id)}
                      >
                        <CornerUpLeft className="size-3.5" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove pending message"
                      onClick={() => void control("cancel", input.id)}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
