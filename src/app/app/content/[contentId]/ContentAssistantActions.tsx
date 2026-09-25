"use client";

import { Check, Circle, MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { sendAssistantIntent } from "@/lib/assistant-events";
import type { getContentReadiness } from "@/lib/content-readiness";

type Readiness = ReturnType<typeof getContentReadiness>;

export function ContentAssistantActions({
  brandId,
  brandName,
  contentPostId,
  contentTitle,
  readiness,
}: {
  brandId: string;
  brandName: string;
  contentPostId: string;
  contentTitle: string;
  readiness: Readiness;
}) {
  const work = () =>
    sendAssistantIntent({
      type: "work_content_post",
      brandId,
      brandName,
      contentPostId,
      contentTitle,
      visibleText: `Help me finish “${contentTitle}”`,
    });

  return (
    <section className="mt-5 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <p className="text-sm font-semibold">Production readiness</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {readiness.completed}/{readiness.total} complete
            {readiness.next ? ` · Next: ${readiness.next.detail}` : " · Ready"}
          </p>
        </div>
        <Button size="sm" className="ml-auto" onClick={work}>
          <MessageSquare className="size-3.5" /> Work in chat
        </Button>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 @xl:grid-cols-3">
        {readiness.checks.map((check) => (
          <div
            key={check.id}
            className="flex items-start gap-2 rounded-lg border bg-background px-2.5 py-2"
            title={check.detail}
          >
            {check.complete ? (
              <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
            ) : (
              <Circle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className="min-w-0">
              <span className="block text-xs font-medium">{check.label}</span>
              <span className="block truncate text-[10px] text-muted-foreground">
                {check.detail}
              </span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
