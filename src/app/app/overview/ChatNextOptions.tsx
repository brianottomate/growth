"use client";
import { Pencil, ArrowUpRight } from "lucide-react";
import { isToolUIPart, getToolName, type UIMessage } from "ai";
import {
  chatNextOptionsOutputSchema,
  type ChatNextOption,
} from "@/lib/chat-next-options";
import { hasPendingApproval } from "@/lib/chat-turns";
import { Button } from "@/components/ui/button";
export function ChatNextOptions({
  messages,
  disabled,
  choose,
}: {
  messages: UIMessage[];
  disabled: boolean;
  choose: (option: ChatNextOption) => void;
}) {
  const tail = messages.at(-1);
  if (disabled || tail?.role !== "assistant" || hasPendingApproval(messages))
    return null;
  const part = [...tail.parts]
    .reverse()
    .find(
      (part) =>
        isToolUIPart(part) &&
        getToolName(part) === "presentNextOptions" &&
        part.state === "output-available",
    );
  if (!part || !("output" in part)) return null;
  const parsed = chatNextOptionsOutputSchema.safeParse(part.output);
  if (!parsed.success) return null;
  return (
    <div
      aria-label="Suggested next steps"
      className="mb-3 flex flex-wrap gap-2"
    >
      {parsed.data.data.options.map((option, index) => (
        <Button
          key={index}
          type="button"
          size="sm"
          variant="outline"
          className="h-auto max-w-full text-left whitespace-normal"
          onClick={() => choose(option)}
        >
          {option.kind === "detail" ? (
            <Pencil className="size-3.5" />
          ) : (
            <ArrowUpRight className="size-3.5" />
          )}
          {option.label}
        </Button>
      ))}
    </div>
  );
}
