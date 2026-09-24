"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { orpc } from "@/orpc/client";

/**
 * The brand story: the short brief every creative prompt for this brand
 * reads. Drafted by AI from the site, the homes and the guests; edited here;
 * added to by the agent as it learns from corrections.
 */
export function BrandStoryCard({
  brandId,
  story,
}: {
  brandId: string;
  story: string | null;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;

  const save = useMutation(
    orpc.brand.setStory.mutationOptions({
      onSuccess: () => {
        setDraft(null);
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const write = useMutation(
    orpc.brand.draftStory.mutationOptions({
      onSuccess: () => router.refresh(),
      onError: (error) => toast.error(error.message),
    }),
  );

  return (
    <section className="space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Brand story</h2>
          <p className="text-xs text-muted-foreground">
            What makes this brand itself, who books it, its voice and what to
            avoid. Every headline, caption and review for the brand reads it.
          </p>
        </div>
        {editing ? (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={save.isPending}
              onClick={() => setDraft(null)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              loading={save.isPending}
              onClick={() => save.mutate({ brandId, story: draft })}
            >
              Save
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              loading={write.isPending}
              onClick={() => write.mutate({ brandId })}
            >
              <Sparkles className="size-3.5" />
              {story ? "Redraft" : "Draft with AI"}
            </Button>
            {story ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDraft(story)}
              >
                Edit
              </Button>
            ) : null}
          </div>
        )}
      </div>
      {editing ? (
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={10}
          maxLength={4000}
          className="w-full rounded-lg border bg-muted/30 p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      ) : story ? (
        <p className="text-sm whitespace-pre-line">{story}</p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {write.isPending
            ? "Reading the site, the homes and what guests say…"
            : "No story yet."}
        </p>
      )}
    </section>
  );
}
