"use client";

import { growthResultSummary } from "@/lib/growth-result-summary";
import { EmailPreviewFrame } from "@/app/app/newsletters/[id]/EmailPreviewFrame";
import Link from "next/link";

export function EmailResultPreview({ result }: { result: unknown }) {
  const summary = growthResultSummary("email", result);
  const envelope = result as {
    ok?: boolean;
    data?: { preview?: { html?: string; warnings?: string[] } };
  };
  const preview = envelope?.data?.preview;
  return (
    <section
      className="overflow-hidden rounded-xl border bg-card"
      aria-label="Email preview"
    >
      <header className="space-y-2 border-b p-4">
        <p className="text-xs text-muted-foreground">{summary.description}</p>
        <h3 className="text-base font-semibold">{summary.title}</h3>
        <div className="flex flex-wrap gap-2">
          {summary.facts.map((fact) => (
            <span key={fact} className="rounded-md bg-muted px-2 py-1 text-xs">
              {fact}
            </span>
          ))}
        </div>
      </header>
      {preview?.html ? (
        <EmailPreviewFrame html={preview.html} />
      ) : (
        <p className="p-4 text-sm text-muted-foreground">
          Full preview unavailable. Open the email in Growth.
        </p>
      )}
      <footer className="space-y-2 border-t p-4 text-xs">
        {preview?.warnings?.map((warning) => (
          <p key={warning} className="text-muted-foreground">
            {warning}
          </p>
        ))}
        <Link href={summary.href} className="underline underline-offset-2">
          {summary.linkLabel}
        </Link>
      </footer>
    </section>
  );
}
