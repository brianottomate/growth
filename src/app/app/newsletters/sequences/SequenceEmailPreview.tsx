"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { orpc } from "@/orpc/client";
import { Button } from "@/components/ui/button";
import { EmailPreviewFrame } from "../[id]/EmailPreviewFrame";

export function SequenceEmailPreview({
  platformPostId,
}: {
  platformPostId: string;
}) {
  const [viewAs, setViewAs] = useState<"template" | "full" | "sparse">(
    "template",
  );
  const preview = useQuery({
    queryKey: [
      ...orpc.newsletter.key(),
      "sequence-preview",
      platformPostId,
      viewAs,
    ],
    queryFn: () =>
      orpc.newsletter.renderPreview.call({ platformPostId, viewAs }),
  });
  return (
    <div className="mt-4 overflow-hidden rounded-lg border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
        <span className="text-sm font-medium">Email preview</span>
        <div className="flex flex-wrap gap-1" aria-label="Preview guest data">
          {(
            [
              ["template", "As written"],
              ["full", "Sample guest"],
              ["sparse", "No guest data"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              size="sm"
              variant={viewAs === value ? "secondary" : "ghost"}
              aria-pressed={viewAs === value}
              onClick={() => setViewAs(value)}
            >
              {label}
            </Button>
          ))}
          <Button
            size="sm"
            variant="ghost"
            disabled={preview.isFetching}
            onClick={() => void preview.refetch()}
          >
            Refresh preview
          </Button>
        </div>
      </div>
      {preview.isPending ? (
        <p className="p-4 text-sm text-muted-foreground">
          Loading email preview…
        </p>
      ) : preview.error ? (
        <div role="alert" className="p-4 text-sm">
          {preview.error.message}
          <Button variant="ghost" onClick={() => void preview.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <EmailPreviewFrame html={preview.data.html} />
      )}
      {preview.data?.warnings?.length ? (
        <ul className="space-y-1 border-t p-3 text-xs text-muted-foreground">
          {preview.data.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
