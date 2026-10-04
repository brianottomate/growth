"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { FileText, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { orpc } from "@/orpc/client";
import { BrandStoryContent } from "./brand-content";
import { EmptyState } from "@/components/ui/empty-state";
import { ShapeBrandButton } from "./ShapeBrandButton";

/**
 * The brand story: the short brief every creative prompt for this brand
 * reads. Drafted by AI from the site, the homes and the guests; edited here;
 * added to by the agent as it learns from corrections.
 */
export function BrandStoryCard({
  brandId,
  brandName,
  story,
}: {
  brandId: string;
  brandName: string;
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

  const actions = (primary = false) => (
    <>
      {story ? (
        <Button size="sm" variant="outline" onClick={() => setDraft(story)}>
          Edit
        </Button>
      ) : (
        <Button
          size="sm"
          variant={primary ? "default" : "outline"}
          loading={write.isPending}
          onClick={() => write.mutate({ brandId })}
        >
          <Sparkles className="size-3.5" />
          Write story
        </Button>
      )}
      <ShapeBrandButton
        brandId={brandId}
        brandName={brandName}
        section="brand story"
      />
    </>
  );
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <FileText
              aria-hidden="true"
              className="size-4 text-muted-foreground"
            />
            Brand story
          </h2>
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
          <div className="flex flex-wrap gap-2">{actions()}</div>
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
        <BrandStoryContent story={story} />
      ) : (
        <EmptyState
          compact
          icon={FileText}
          title="Give the creative a shared direction"
          description={
            write.isPending
              ? "Reading the site, homes and guest evidence…"
              : "Write and save a story from the brand’s identity, homes and guest reviews, or Shape its direction together."
          }
          actions={actions(true)}
        />
      )}
    </section>
  );
}
