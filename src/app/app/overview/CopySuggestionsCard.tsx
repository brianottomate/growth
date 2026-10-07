"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  copySuggestionApplyMessage,
  copySuggestionsDataSchema,
} from "@/lib/copy-suggestions";

export function CopySuggestionsCard({
  output,
  onPrompt,
  busy,
}: {
  output: unknown;
  onPrompt: (prompt: string) => void;
  busy: boolean;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const parsed = copySuggestionsDataSchema.safeParse(output);
  if (!parsed.success)
    return (
      <p className="text-sm text-muted-foreground">
        These copy suggestions are unavailable.
      </p>
    );
  const { target, options } = parsed.data;
  return (
    <div className="@container space-y-3 rounded-xl border p-3">
      <div>
        <h3 className="text-sm font-semibold">Copy suggestions</h3>
        <p className="text-xs text-muted-foreground">
          Choose a set to apply in chat. Your draft stays unchanged until then.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 @min-[640px]:grid-cols-2">
        {options.map((option, index) => (
          <section
            key={index}
            className="min-w-0 space-y-3 rounded-lg border bg-card p-3"
          >
            <div>
              <h4 className="text-sm font-medium">
                {index + 1}. {option.label}
              </h4>
              <p className="mt-1 text-xs text-muted-foreground">
                {option.rationale}
              </p>
            </div>
            {option.edits.map((edit, editIndex) => (
              <div key={editIndex} className="space-y-1 border-t pt-2">
                <p className="text-xs font-medium">
                  {edit.kind === "ad"
                    ? "Ad copy"
                    : edit.kind === "card"
                      ? "Card copy"
                      : edit.kind === "catalog"
                        ? "Catalog image"
                        : "Image text"}
                  {"cardId" in edit ? ` · ${edit.cardId}` : ""}
                  {"shape" in edit ? ` · ${edit.shape ?? "shared"}` : ""}
                </p>
                {Object.entries(edit)
                  .filter(
                    ([field]) => !["kind", "cardId", "shape"].includes(field),
                  )
                  .map(([field, value]) => (
                    <div key={field}>
                      <span className="text-xs text-muted-foreground">
                        {field === "body"
                          ? "Primary text"
                          : field.charAt(0).toUpperCase() + field.slice(1)}
                      </span>
                      <p className="text-sm break-words whitespace-pre-wrap">
                        {Array.isArray(value)
                          ? value.join(" · ") || "Clear pills"
                          : value || "Clear text"}
                      </p>
                    </div>
                  ))}
              </div>
            ))}
            <Button
              size="sm"
              variant={selected === index ? "secondary" : "outline"}
              disabled={busy}
              onClick={() => {
                setSelected(index);
                onPrompt(copySuggestionApplyMessage(target, option));
              }}
            >
              {selected === index ? "Apply again in chat" : "Apply in chat"}
            </Button>
          </section>
        ))}
      </div>
    </div>
  );
}
